import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

async function executeMultiple(url, sql) {
  const client = createClient({ url });
  try {
    return await client.executeMultiple(sql);
  } finally {
    client.close();
  }
}

test("canonical manifest classifies every SQL file exactly once", async () => {
  const manifest = await loadMigrationManifest();
  assert.equal(manifest.migrations.length, 10);
  assert.equal(manifest.excluded.length, 5);
  assert.equal(new Set(manifest.migrations.map(({ id }) => id)).size, 10);
});

test("fresh migration reaches the H04b schema and a second run is a no-op", async (t) => {
  const database = await temporaryDatabase(t);

  const first = await migrateDatabase({ url: database.url });
  assert.equal(first.appliedMigrationIds.length, 10);
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
  assert.equal(transactionColumnNames.has("exchange_rate_snapshot"), true);
  assert.equal(transactionColumns.rows.find((row) => row.name === "amount_usd")?.notnull, 0);

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
  assert.equal(second.inspection.appliedMigrationIds.length, 10);
});

async function writeManifestSnapshot(directory, manifest, migrationCount, { failCurrencyMigration = false } = {}) {
  const sourceDirectory = manifest.migrationDirectory;
  const migrations = manifest.migrations.slice(0, migrationCount).map((migration) => ({
    id: migration.id,
    files: migration.files.map(({ file }) => file),
    ...(migration.preflight.length ? { preflight: migration.preflight } : {}),
    ...(migration.minimumSqliteVersion ? { minimumSqliteVersion: migration.minimumSqliteVersion } : {}),
  }));
  const excluded = manifest.excluded.map(({ file, reason }) => ({ file, reason }));
  for (const migration of manifest.migrations.slice(migrationCount)) {
    for (const { file } of migration.files) {
      excluded.push({ file, reason: "Excluded by this isolated migration test snapshot." });
    }
  }
  const files = new Set([
    ...migrations.flatMap((migration) => migration.files),
    ...excluded.map(({ file }) => file),
  ]);
  for (const file of files) {
    let contents = await readFile(join(sourceDirectory, file), "utf8");
    if (failCurrencyMigration && file === "0011_currency_modes.sql") {
      contents += "\nSELECT * FROM table_that_does_not_exist;\n";
    }
    await writeFile(join(directory, file), contents, "utf8");
  }
  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({ version: 1, ledgerTable: "hermes_schema_migrations", migrations, excluded }), "utf8");
  return manifestPath;
}

test("currency migration preserves existing records, incoming FKs, indexes and permits ARS-only rows", async (t) => {
  const database = await temporaryDatabase(t);
  const canonical = await loadMigrationManifest();
  const prefixManifest = await writeManifestSnapshot(database.directory, canonical, 9);
  await migrateDatabase({ url: database.url, manifestPath: prefixManifest });
  await executeMultiple(database.url, `
    INSERT INTO users (id, name, username) VALUES ('u1', 'User', 'user');
    INSERT INTO groups (id, name, owner_id) VALUES ('g1', 'Group', 'u1');
    INSERT INTO categories (id, group_id, slug, name) VALUES ('c1', 'g1', 'food', 'Food');
    INSERT INTO monthly_settings (id, user_id, group_id, month, income_usd, exchange_rate, saving_goal_usd, saving_goal_yellow)
      VALUES ('m1', 'u1', 'g1', '2026-10', 2500, 1600, 500, 300);
    INSERT INTO transactions (id, operation_id, user_id, group_id, category_id, amount_ars, amount_usd, date, month)
      VALUES ('t1', 'op1', 'u1', 'g1', 'c1', 1600, 1, '2026-10-03', '2026-10');
    INSERT INTO reimbursement_requests (id, transaction_id, requester_id, amount)
      VALUES ('r1', 't1', 'u1', 800);
    INSERT INTO recurring_expenses (id, user_id, group_id, name, amount_ars, category_id)
      VALUES ('re1', 'u1', 'g1', 'Rent', 1600, 'c1');
    INSERT INTO recurring_executions (id, recurring_expense_id, transaction_id, scheduled_date)
      VALUES ('rx1', 're1', 't1', '2026-10-03');
  `);

  const result = await migrateDatabase({ url: database.url });
  assert.deepEqual(result.appliedMigrationIds, ["0090-currency-modes"]);
  assert.equal(result.inspection.preflight.foreignKeysEnabled, true);
  assert.equal(result.inspection.preflight.foreignKeyViolationCount, 0);

  const transaction = await query(database.url, "SELECT * FROM transactions WHERE id = 't1'");
  assert.equal(transaction.rows.length, 1);
  assert.equal(Number(transaction.rows[0].amount_ars), 1600);
  assert.equal(Number(transaction.rows[0].amount_usd), 1);
  assert.equal(transaction.rows[0].operation_id, "op1");
  assert.equal(transaction.rows[0].currency_mode, "USD_ARS");
  assert.equal(transaction.rows[0].exchange_rate_snapshot, null);
  const settings = await query(database.url, "SELECT * FROM monthly_settings WHERE id = 'm1'");
  assert.equal(Number(settings.rows[0].income_usd), 2500);
  assert.equal(Number(settings.rows[0].saving_goal_usd), 500);
  assert.equal(Number(settings.rows[0].saving_goal_yellow), 300);
  assert.equal(Number(settings.rows[0].exchange_rate), 1600);
  assert.equal(settings.rows[0].currency_mode, "USD_ARS");
  assert.equal(settings.rows[0].income_ars, null);
  assert.equal(settings.rows[0].saving_goal_ars, null);
  assert.equal(settings.rows[0].saving_goal_yellow_ars, null);
  const settingsColumns = await query(database.url, "PRAGMA table_info(monthly_settings)");
  for (const name of ["income_usd", "saving_goal_usd", "saving_goal_yellow", "exchange_rate"]) {
    assert.equal(Number(settingsColumns.rows.find((row) => row.name === name)?.notnull), 0);
  }
  await query(database.url, `
    INSERT INTO monthly_settings (id, user_id, group_id, month, currency_mode,
      income_ars, saving_goal_ars, saving_goal_yellow_ars)
    VALUES ('m2', 'u1', 'g1', '2026-11', 'ARS_ARS', 2000000, 500000, 300000)
  `);
  const arsSettings = await query(database.url, "SELECT * FROM monthly_settings WHERE id = 'm2'");
  for (const name of ["income_usd", "saving_goal_usd", "saving_goal_yellow", "exchange_rate"]) {
    assert.equal(arsSettings.rows[0][name], null);
  }
  await assert.rejects(query(database.url, "UPDATE monthly_settings SET income_usd = 1 WHERE id = 'm2'"));
  await assert.rejects(query(database.url, "UPDATE monthly_settings SET income_ars = 1 WHERE id = 'm1'"));
  await assert.rejects(query(database.url, `
    INSERT INTO monthly_settings (id, user_id, group_id, month, currency_mode,
      income_ars, saving_goal_ars, saving_goal_yellow_ars, income_usd)
    VALUES ('m3', 'u1', 'g1', '2026-12', 'ARS_ARS', 2000000, 500000, 300000, 1)
  `));
  const childCounts = await query(database.url, `
    SELECT
      (SELECT COUNT(*) FROM reimbursement_requests WHERE transaction_id = 't1') AS reimbursements,
      (SELECT COUNT(*) FROM recurring_executions WHERE transaction_id = 't1') AS executions
  `);
  assert.equal(Number(childCounts.rows[0].reimbursements), 1);
  assert.equal(Number(childCounts.rows[0].executions), 1);
  const incomingForeignKeys = await query(database.url, `
    SELECT m.name AS child_table, f."from" AS child_column
    FROM sqlite_schema m, pragma_foreign_key_list(m.name) f
    WHERE m.type = 'table' AND f."table" = 'transactions'
  `);
  assert.deepEqual(new Set(incomingForeignKeys.rows.map((row) => String(row.child_table))), new Set(["reimbursement_requests", "recurring_executions"]));
  const indexes = await query(database.url, "SELECT name FROM sqlite_schema WHERE type = 'index'");
  const names = new Set(indexes.rows.map((row) => String(row.name)));
  for (const name of ["tx_user_month_idx", "tx_category_idx", "tx_group_id_idx", "transactions_operation_id_idx"]) {
    assert.equal(names.has(name), true, `missing index ${name}`);
  }

  await executeMultiple(database.url, `
    INSERT INTO transactions (id, user_id, group_id, category_id, amount_ars, amount_usd,
      exchange_rate_snapshot, currency_mode, date, month)
    VALUES ('t2', 'u1', 'g1', 'c1', 2500, NULL, NULL, 'ARS_ARS', '2026-10-03', '2026-10')
  `);
  await assert.rejects(query(database.url, `
    INSERT INTO transactions (id, user_id, group_id, category_id, amount_ars, amount_usd,
      exchange_rate_snapshot, currency_mode, date, month)
    VALUES ('t3', 'u1', 'g1', 'c1', 2500, 1.56, NULL, 'ARS_ARS', '2026-10-03', '2026-10')
  `));
  await assert.rejects(query(database.url, `
    INSERT INTO transactions (id, user_id, group_id, category_id, amount_ars, amount_usd,
      exchange_rate_snapshot, currency_mode, date, month)
    VALUES ('t6', 'u1', 'g1', 'c1', 2500, NULL, 1600, 'ARS_ARS', '2026-10-03', '2026-10')
  `));
  await assert.rejects(query(database.url, `
    INSERT INTO transactions (id, operation_id, user_id, group_id, category_id, amount_ars,
      amount_usd, currency_mode, date, month)
    VALUES ('t4', 'op1', 'u1', 'g1', 'c1', 2500, NULL, 'ARS_ARS', '2026-10-03', '2026-10')
  `));
  await assert.rejects(query(database.url, `
    INSERT INTO transactions (id, user_id, group_id, category_id, amount_ars, amount_usd,
      exchange_rate_snapshot, currency_mode, date, month)
    VALUES ('t5', 'u1', 'g1', 'c1', 2500, NULL, 1600, 'USD_ARS', '2026-10-03', '2026-10')
  `));
  await assert.rejects(query(database.url, "UPDATE transactions SET amount_usd = NULL WHERE id = 't1'"));
  await assert.rejects(query(database.url, "UPDATE transactions SET exchange_rate_snapshot = 1600 WHERE id = 't2'"));
  await query(database.url, "UPDATE transactions SET description = 'valid update' WHERE id = 't2'");
  const second = await migrateDatabase({ url: database.url });
  assert.deepEqual(second.appliedMigrationIds, []);
});

test("currency migration rolls back atomically with FK enforcement left on", async (t) => {
  const database = await temporaryDatabase(t);
  const canonical = await loadMigrationManifest();
  const prefixManifest = await writeManifestSnapshot(database.directory, canonical, 9);
  await migrateDatabase({ url: database.url, manifestPath: prefixManifest });
  await executeMultiple(database.url, `
    INSERT INTO users (id, name, username) VALUES ('u1', 'User', 'user');
    INSERT INTO categories (id, slug, name) VALUES ('c1', 'food', 'Food');
    INSERT INTO transactions (id, user_id, category_id, amount_ars, amount_usd, date, month)
      VALUES ('t1', 'u1', 'c1', 1600, 1, '2026-10-03', '2026-10');
  `);
  const brokenManifest = await writeManifestSnapshot(database.directory, canonical, 10, { failCurrencyMigration: true });
  await assert.rejects(migrateDatabase({ url: database.url, manifestPath: brokenManifest }));
  const foreignKeys = await query(database.url, "PRAGMA foreign_keys");
  assert.equal(Number(foreignKeys.rows[0].foreign_keys), 1);
  const oldTable = await query(database.url, "PRAGMA table_info(transactions)");
  assert.equal(oldTable.rows.find((row) => row.name === "amount_usd")?.notnull, 1);
  const data = await query(database.url, "SELECT amount_usd FROM transactions WHERE id = 't1'");
  assert.equal(Number(data.rows[0].amount_usd), 1);
  const ledger = await query(database.url, "SELECT migration_id FROM hermes_schema_migrations ORDER BY migration_id");
  assert.equal(ledger.rows.length, 9);
});

test("migration refuses SQLite versions older than the DROP COLUMN requirement", async (t) => {
  const database = await temporaryDatabase(t);
  const canonical = await loadMigrationManifest();
  const fullManifestPath = await writeManifestSnapshot(database.directory, canonical, 10);
  const manifest = JSON.parse(await readFile(fullManifestPath, "utf8"));
  manifest.migrations.at(-1).minimumSqliteVersion = "99.0.0";
  await writeFile(fullManifestPath, JSON.stringify(manifest), "utf8");

  await assert.rejects(
    migrateDatabase({ url: database.url, manifestPath: fullManifestPath }),
    (error) => error.code === "SQLITE_VERSION_UNSUPPORTED",
  );
  const tables = await query(database.url, "SELECT name FROM sqlite_schema WHERE type = 'table'");
  assert.deepEqual(tables.rows, []);
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
