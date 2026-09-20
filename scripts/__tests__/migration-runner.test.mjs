import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  inspectDatabase,
  loadMigrationManifest,
  migrateDatabase,
} from "../migrate.mjs";

async function temporaryDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), "hermes-migrations-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "test.db");
  return {
    directory,
    databasePath,
    url: pathToFileURL(databasePath).href,
  };
}

async function query(url, sql) {
  const client = createClient({ url });
  try {
    return await client.execute(sql);
  } finally {
    client.close();
  }
}

test("canonical manifest classifies every SQL file exactly once", async () => {
  const manifest = await loadMigrationManifest();
  assert.equal(manifest.migrations.length, 9);
  assert.equal(manifest.excluded.length, 5);
  assert.equal(new Set(manifest.migrations.map(({ id }) => id)).size, 9);
});

test("fresh migration reaches the H04b schema and a second run is a no-op", async (t) => {
  const database = await temporaryDatabase(t);

  const first = await migrateDatabase({ url: database.url });
  assert.equal(first.appliedMigrationIds.length, 9);
  assert.equal(first.inspection.state, "canonical");
  assert.equal(first.inspection.preflight.foreignKeysEnabled, true);
  assert.equal(first.inspection.preflight.foreignKeyViolationCount, 0);

  const requiredTables = [
    "hermes_schema_migrations",
    "reimbursement_requests",
    "recurring_executions",
    "telegram_delivery_outbox",
    "telegram_operations",
    "telegram_update_inbox",
    "user_payment_info",
  ];
  const tables = await query(
    database.url,
    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
  );
  const names = new Set(tables.rows.map((row) => String(row.name)));
  for (const table of requiredTables) assert.equal(names.has(table), true, `missing table ${table}`);

  const transactionColumns = await query(database.url, "PRAGMA table_info(transactions)");
  const transactionColumnNames = new Set(transactionColumns.rows.map((row) => String(row.name)));
  assert.equal(transactionColumnNames.has("group_id"), true);
  assert.equal(transactionColumnNames.has("requires_reimbursement"), true);
  assert.equal(transactionColumnNames.has("operation_id"), true);

  const groupColumns = await query(database.url, "PRAGMA table_info(groups)");
  assert.equal(groupColumns.rows.some((row) => row.name === "partner_id"), true);

  const indexes = await query(
    database.url,
    "SELECT name FROM sqlite_schema WHERE type = 'index' ORDER BY name",
  );
  const indexNames = new Set(indexes.rows.map((row) => String(row.name)));
  assert.equal(indexNames.has("execution_recurring_date_idx"), true);
  assert.equal(indexNames.has("telegram_delivery_outbox_delivery_key_idx"), true);

  const outboxForeignKeys = await query(database.url, "PRAGMA foreign_key_list(telegram_delivery_outbox)");
  assert.equal(outboxForeignKeys.rows.filter((row) => row.table === "telegram_operations").length, 3);

  const second = await migrateDatabase({ url: database.url });
  assert.deepEqual(second.appliedMigrationIds, []);
  assert.equal(second.inspection.appliedMigrationIds.length, 9);
});

test("unmanaged non-empty databases are inspected but never adopted or mutated", async (t) => {
  const database = await temporaryDatabase(t);
  await query(database.url, "CREATE TABLE legacy_data (id TEXT PRIMARY KEY)");

  await assert.rejects(
    migrateDatabase({ url: database.url }),
    (error) => error.code === "LEGACY_UNADOPTED",
  );

  const inspection = await inspectDatabase({ url: database.url });
  assert.equal(inspection.state, "legacy-unadopted");
  assert.equal(inspection.tables.includes("hermes_schema_migrations"), false);
  assert.deepEqual(inspection.tables, ["legacy_data"]);
});

test("inspection identifies an unmanaged partial H04 footprint without writing a ledger", async (t) => {
  const database = await temporaryDatabase(t);
  await query(database.url, "CREATE TABLE transactions (id TEXT PRIMARY KEY, operation_id TEXT)");

  const inspection = await inspectDatabase({ url: database.url });
  assert.equal(inspection.state, "partial");
  assert.equal(inspection.preflight.operationColumns.transactions, true);
  assert.equal(inspection.preflight.operationColumns.splits, false);
  assert.equal(inspection.tables.includes("hermes_schema_migrations"), false);
});

test("a failing migration rolls back its DDL and ledger entry", async (t) => {
  const database = await temporaryDatabase(t);
  const sqlPath = join(database.directory, "001_broken.sql");
  const manifestPath = join(database.directory, "manifest.json");
  await writeFile(
    sqlPath,
    "CREATE TABLE must_rollback (id TEXT PRIMARY KEY); SELECT * FROM missing_table;",
    "utf8",
  );
  await writeFile(
    manifestPath,
    JSON.stringify({
      version: 1,
      ledgerTable: "hermes_schema_migrations",
      migrations: [{ id: "001-broken", files: ["001_broken.sql"] }],
      excluded: [],
    }),
    "utf8",
  );

  await assert.rejects(migrateDatabase({ url: database.url, manifestPath }));
  const tables = await query(
    database.url,
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  assert.deepEqual(tables.rows, []);
});

test("a changed checksum is rejected before pending work", async (t) => {
  const database = await temporaryDatabase(t);
  await migrateDatabase({ url: database.url });
  const client = createClient({ url: database.url });
  try {
    await client.execute(
      "UPDATE hermes_schema_migrations SET checksum = 'tampered' WHERE migration_id = '0000-base'",
    );
  } finally {
    client.close();
  }

  await assert.rejects(
    migrateDatabase({ url: database.url }),
    (error) => error.code === "LEDGER_CONFLICT",
  );
  const inspection = await inspectDatabase({ url: database.url });
  assert.equal(inspection.state, "conflict");
  assert.deepEqual(inspection.conflicts, [
    { migrationId: "0000-base", reason: "checksum-mismatch" },
  ]);
});

test("recurring duplicates block the outbox migration before it is marked", async (t) => {
  const database = await temporaryDatabase(t);
  const canonical = await loadMigrationManifest();
  const client = createClient({ url: database.url });
  try {
    await client.execute("PRAGMA foreign_keys = ON");
    for (const migration of canonical.migrations.slice(0, 8)) {
      const transaction = await client.transaction("write");
      try {
        await transaction.execute(`CREATE TABLE IF NOT EXISTS hermes_schema_migrations (
          migration_id TEXT PRIMARY KEY,
          checksum TEXT NOT NULL,
          applied_at INTEGER NOT NULL,
          runner_version TEXT NOT NULL
        )`);
        for (const file of migration.files) await transaction.executeMultiple(file.contents);
        await transaction.execute({
          sql: `INSERT INTO hermes_schema_migrations
            (migration_id, checksum, applied_at, runner_version) VALUES (?, ?, ?, ?)`,
          args: [migration.id, migration.checksum, Date.now(), "1"],
        });
        await transaction.commit();
      } finally {
        transaction.close();
      }
    }
    await client.batch([
      {
        sql: `INSERT INTO users (id, name, username) VALUES (?, ?, ?)`,
        args: ["user-1", "Test", "test"],
      },
      {
        sql: `INSERT INTO recurring_expenses
          (id, user_id, name, amount_ars, frequency, day_of_month)
          VALUES (?, ?, ?, ?, ?, ?)`,
        args: ["recurring-1", "user-1", "Service", 100, "monthly", 1],
      },
      {
        sql: `INSERT INTO recurring_executions
          (id, recurring_expense_id, scheduled_date) VALUES (?, ?, ?)`,
        args: ["execution-1", "recurring-1", "2026-09-01"],
      },
      {
        sql: `INSERT INTO recurring_executions
          (id, recurring_expense_id, scheduled_date) VALUES (?, ?, ?)`,
        args: ["execution-2", "recurring-1", "2026-09-01"],
      },
    ]);
  } finally {
    client.close();
  }

  await assert.rejects(
    migrateDatabase({ url: database.url }),
    (error) => error.code === "RECURRING_DUPLICATES",
  );
  const ledger = await query(
    database.url,
    "SELECT migration_id FROM hermes_schema_migrations ORDER BY migration_id",
  );
  assert.equal(ledger.rows.length, 8);
  assert.equal(ledger.rows.some((row) => row.migration_id === "0080-telegram-operations-outbox"), false);
});

test("the outbox preflight follows the migration file even when its id changes", async (t) => {
  const database = await temporaryDatabase(t);
  const canonical = await loadMigrationManifest();
  const outbox = canonical.migrations.at(-1);
  const manifestPath = join(database.directory, "manifest.json");
  await writeFile(join(database.directory, outbox.files[0].file), outbox.files[0].contents, "utf8");
  await writeFile(
    manifestPath,
    JSON.stringify({
      version: 1,
      ledgerTable: "hermes_schema_migrations",
      migrations: [{
        id: "renamed-outbox-step",
        files: [outbox.files[0].file],
        preflight: ["recurring-duplicates"],
      }],
      excluded: [],
    }),
    "utf8",
  );

  const client = createClient({ url: database.url });
  try {
    await client.executeMultiple(`
      CREATE TABLE recurring_executions (
        id TEXT PRIMARY KEY,
        recurring_expense_id TEXT NOT NULL,
        scheduled_date TEXT NOT NULL
      );
      INSERT INTO recurring_executions VALUES ('1', 'r', '2026-09-01');
      INSERT INTO recurring_executions VALUES ('2', 'r', '2026-09-01');
      CREATE TABLE hermes_schema_migrations (
        migration_id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        runner_version TEXT NOT NULL
      );
    `);
  } finally {
    client.close();
  }

  await assert.rejects(
    migrateDatabase({ url: database.url, manifestPath }),
    (error) => error.code === "RECURRING_DUPLICATES",
  );
});

test("material schema drift conflicts with an otherwise complete ledger", async (t) => {
  const database = await temporaryDatabase(t);
  await migrateDatabase({ url: database.url });
  await query(database.url, "DROP INDEX execution_recurring_date_idx");

  const inspection = await inspectDatabase({ url: database.url });
  assert.equal(inspection.state, "conflict");
  assert.equal(inspection.schemaDrift.includes("missing-index:execution_recurring_date_idx"), true);
  await assert.rejects(
    migrateDatabase({ url: database.url }),
    (error) => error.code === "SCHEMA_DRIFT",
  );
});

test("the schema fingerprint detects a named index recreated with the wrong definition", async (t) => {
  const database = await temporaryDatabase(t);
  await migrateDatabase({ url: database.url });
  const client = createClient({ url: database.url });
  try {
    await client.execute("DROP INDEX execution_recurring_date_idx");
    await client.execute(
      "CREATE UNIQUE INDEX execution_recurring_date_idx ON recurring_executions(scheduled_date)",
    );
  } finally {
    client.close();
  }

  const inspection = await inspectDatabase({ url: database.url });
  assert.equal(inspection.state, "conflict");
  assert.equal(inspection.schemaDrift.includes("missing-index:execution_recurring_date_idx"), false);
  assert.equal(inspection.schemaDrift.includes("schema-fingerprint-mismatch"), true);
});

test("ledger history recorded out of manifest order is a conflict", async (t) => {
  const database = await temporaryDatabase(t);
  await migrateDatabase({ url: database.url });
  await query(
    database.url,
    "UPDATE hermes_schema_migrations SET applied_at = 0 WHERE migration_id = '0080-telegram-operations-outbox'",
  );

  const inspection = await inspectDatabase({ url: database.url });
  assert.equal(inspection.state, "conflict");
  assert.equal(inspection.conflicts.some((entry) => entry.reason === "out-of-order-history"), true);
});

test("remote URLs are rejected without opening a connection", async () => {
  await assert.rejects(
    migrateDatabase({ url: "libsql://production.invalid" }),
    (error) => error.code === "LOCAL_DATABASE_REQUIRED",
  );
});
