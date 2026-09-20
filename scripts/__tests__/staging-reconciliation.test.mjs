import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migrateDatabase } from "../migrate.mjs";
import {
  captureReconciliationSnapshot,
  compareReconciliationSnapshots,
  createReadOnlyAdoptionPlan,
} from "../staging-reconciliation.mjs";

const EVIDENCE_SALT = "synthetic-staging-evidence-salt";
const RELEASE_SHA = "1433d552005cd4c6d53df1f02bf8d82374b2005e";
const BACKUP_EVIDENCE = {
  version: 1,
  backupId: "synthetic-staging-backup",
  backupSha256: "1".repeat(64),
  restoredSha256: "1".repeat(64),
  restoreVerified: true,
  restoredAt: "2026-09-20T12:00:00.000Z",
};

async function temporaryDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), "hermes-staging-rehearsal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    url: pathToFileURL(join(directory, "staging.db")).href,
  };
}

async function withClient(url, callback) {
  const client = createClient({ url });
  try {
    return await callback(client);
  } finally {
    client.close();
  }
}

async function legacyFixture(url) {
  await withClient(url, async (client) => {
    await client.executeMultiple(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        category_id TEXT NOT NULL REFERENCES categories(id),
        amount_ars REAL NOT NULL,
        amount_usd REAL NOT NULL,
        merchant TEXT,
        description TEXT
      );
      INSERT INTO users VALUES ('user-sensitive-123', 'Sensitive Person');
      INSERT INTO categories VALUES ('category-sensitive-456', 'food', 'Secret Category');
      INSERT INTO transactions VALUES (
        'transaction-sensitive-789',
        'user-sensitive-123',
        'category-sensitive-456',
        1234.5,
        1.25,
        'Private Merchant',
        'Private Description'
      );
    `);
  });
}

test("captures deterministic redacted evidence without mutating an unmanaged legacy DB", async (t) => {
  const database = await temporaryDatabase(t);
  await legacyFixture(database.url);

  const beforeTables = await withClient(database.url, (client) => client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
  ));
  const first = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  const second = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  const afterTables = await withClient(database.url, (client) => client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
  ));

  assert.deepEqual(first, second);
  assert.deepEqual(afterTables.rows, beforeTables.rows);
  assert.equal(afterTables.rows.some((row) => row.name === "hermes_schema_migrations"), false);
  assert.equal(first.tableInventory.transactions.rowCount, 1);
  assert.equal(first.readOnlyVerified, true);
  assert.equal(first.version, 2);
  assert.match(first.signature, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.financialAggregates.transactions.sums, {
    amount_ars: 1234.5,
    amount_usd: 1.25,
  });
  const serialized = JSON.stringify(first);
  for (const sensitive of [
    "user-sensitive-123",
    "category-sensitive-456",
    "transaction-sensitive-789",
    "Sensitive Person",
    "Private Merchant",
    "Private Description",
  ]) {
    assert.equal(serialized.includes(sensitive), false);
  }
});

test("reports duplicate and foreign-key blockers without returning offending rows", async (t) => {
  const database = await temporaryDatabase(t);
  await withClient(database.url, async (client) => {
    await client.executeMultiple(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        amount_ars REAL NOT NULL,
        amount_usd REAL NOT NULL
      );
      INSERT INTO transactions VALUES ('orphan-secret-id', 'missing-secret-user', 1, 1);
      CREATE TABLE recurring_executions (
        id TEXT PRIMARY KEY,
        recurring_expense_id TEXT NOT NULL,
        scheduled_date TEXT NOT NULL
      );
      INSERT INTO recurring_executions VALUES ('execution-secret-one', 'recurring-secret', '2026-09-01');
      INSERT INTO recurring_executions VALUES ('execution-secret-two', 'recurring-secret', '2026-09-01');
    `);
  });

  const snapshot = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  assert.equal(snapshot.integrity.foreignKeyViolations, 1);
  assert.equal(snapshot.integrity.recurringDuplicateGroups, 1);
  assert.deepEqual(snapshot.blockingFindings, [
    "businessOrphans:transactions.user_id",
    "foreignKeyViolations",
    "recurringDuplicateGroups",
  ]);
  assert.equal(JSON.stringify(snapshot).includes("orphan-secret-id"), false);
  assert.equal(JSON.stringify(snapshot).includes("recurring-secret"), false);
});

test("compares preserved tables, key sets, financial aggregates and blockers", async (t) => {
  const database = await temporaryDatabase(t);
  await legacyFixture(database.url);
  const before = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  const unchanged = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  assert.deepEqual(compareReconciliationSnapshots(before, unchanged, { evidenceSalt: EVIDENCE_SALT }), { ok: true, differences: [] });

  await withClient(database.url, (client) => client.execute(
    "UPDATE transactions SET amount_ars = amount_ars + 1 WHERE id = 'transaction-sensitive-789'",
  ));
  const changed = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  const comparison = compareReconciliationSnapshots(before, changed, { evidenceSalt: EVIDENCE_SALT });
  assert.equal(comparison.ok, false);
  assert.equal(comparison.differences.includes("financial-aggregate-changed:transactions"), true);

  await withClient(database.url, (client) => client.execute("CREATE TABLE unexpected_drift (id TEXT PRIMARY KEY)"));
  const drifted = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  assert.equal(
    compareReconciliationSnapshots(changed, drifted, { evidenceSalt: EVIDENCE_SALT }).differences.includes("schema-fingerprint-changed"),
    true,
  );
});

test("a canonical no-op migration preserves synthetic staging evidence", async (t) => {
  const database = await temporaryDatabase(t);
  await migrateDatabase({ url: database.url });
  await withClient(database.url, async (client) => {
    await client.execute("PRAGMA foreign_keys = ON");
    await client.batch([
      { sql: "INSERT INTO users (id, name, username) VALUES (?, ?, ?)", args: ["synthetic-user", "Synthetic", "synthetic"] },
      { sql: "INSERT INTO categories (id, slug, name) VALUES (?, ?, ?)", args: ["synthetic-category", "synthetic", "Synthetic"] },
      {
        sql: `INSERT INTO transactions
          (id, user_id, category_id, amount_ars, amount_usd, date, month)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: ["synthetic-transaction", "synthetic-user", "synthetic-category", 100, 0.1, "2026-09-20", "2026-09"],
      },
    ]);
  });

  const before = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  const migration = await migrateDatabase({ url: database.url });
  const after = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });

  assert.deepEqual(migration.appliedMigrationIds, []);
  assert.deepEqual(compareReconciliationSnapshots(before, after, { evidenceSalt: EVIDENCE_SALT }), { ok: true, differences: [] });
});

test("signed evidence detects tampering and row-level financial changes that preserve global sums", async (t) => {
  const database = await temporaryDatabase(t);
  await withClient(database.url, async (client) => {
    await client.executeMultiple(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        amount_ars REAL NOT NULL,
        amount_usd REAL NOT NULL,
        month TEXT
      );
      INSERT INTO transactions VALUES ('a', 10, 1, '2026-09');
      INSERT INTO transactions VALUES ('b', 20, 2, '2026-09');
    `);
  });
  const before = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  await withClient(database.url, (client) => client.executeMultiple(`
    UPDATE transactions SET amount_ars = 20 WHERE id = 'a';
    UPDATE transactions SET amount_ars = 10 WHERE id = 'b';
  `));
  const after = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  assert.equal(before.financialAggregates.transactions.sums.amount_ars, after.financialAggregates.transactions.sums.amount_ars);
  assert.equal(
    compareReconciliationSnapshots(before, after, { evidenceSalt: EVIDENCE_SALT }).differences.includes(
      "financial-aggregate-changed:transactions",
    ),
    true,
  );

  const tampered = structuredClone(after);
  tampered.financialAggregates.transactions.sums.amount_ars = 31;
  assert.throws(
    () => compareReconciliationSnapshots(before, tampered, { evidenceSalt: EVIDENCE_SALT }),
    (error) => error.code === "INVALID_RECONCILIATION_EVIDENCE",
  );
});

test("reports business orphans even when a legacy schema lacks foreign keys", async (t) => {
  const database = await temporaryDatabase(t);
  await withClient(database.url, (client) => client.executeMultiple(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE categories (id TEXT PRIMARY KEY);
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      category_id TEXT,
      amount_ars REAL,
      amount_usd REAL
    );
    INSERT INTO transactions VALUES ('tx', 'missing-user', 'missing-category', 10, 1);
  `));
  const snapshot = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  assert.equal(snapshot.integrity.businessOrphans["transactions.user_id"], 1);
  assert.equal(snapshot.integrity.businessOrphans["transactions.category_id"], 1);
  assert.equal(snapshot.blockingFindings.includes("businessOrphans:transactions.user_id"), true);
});

test("captures a partial H04 schema as a blocker instead of crashing", async (t) => {
  const database = await temporaryDatabase(t);
  await withClient(database.url, (client) => client.execute(
    "CREATE TABLE telegram_update_inbox (id TEXT PRIMARY KEY, bot_id TEXT)",
  ));
  const snapshot = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  assert.equal(snapshot.integrity.missingRequiredColumns.telegram_update_inbox, 6);
  assert.equal(snapshot.blockingFindings.includes("missingRequiredColumns:telegram_update_inbox"), true);
});

test("blocks unknown committed operation resource types but accepts resource-less batches", async (t) => {
  const database = await temporaryDatabase(t);
  await migrateDatabase({ url: database.url });
  await withClient(database.url, (client) => client.executeMultiple(`
    INSERT INTO telegram_operations
      (operation_id, bot_id, update_id, operation_kind, status, resource_type, resource_id, result_json, committed_at)
    VALUES
      ('unknown-resource', 'bot', 'update-1', 'test.unknown', 'committed', 'unknown', 'resource', '{}', 1),
      ('valid-batch', 'bot', 'update-2', 'recurring.confirm_all', 'committed', 'recurring_batch', NULL, '{}', 1);
  `));
  const snapshot = await captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT });
  assert.equal(snapshot.integrity.invalidOperationResources, 1);
  assert.equal(snapshot.blockingFindings.includes("invalidOperationResources"), true);
});

test("adoption planning is read-only, binds exact evidence and never authorizes apply", async (t) => {
  const database = await temporaryDatabase(t);
  await legacyFixture(database.url);
  const plan = await createReadOnlyAdoptionPlan({
    url: database.url,
    evidenceSalt: EVIDENCE_SALT,
    releaseSha: RELEASE_SHA,
    backupEvidence: BACKUP_EVIDENCE,
  });

  assert.equal(plan.decision, "blocked");
  assert.equal(plan.applyAuthorized, false);
  assert.equal(plan.inspectionState, "legacy-unadopted");
  assert.equal(plan.sourceSchemaFingerprint, plan.observed.schemaFingerprint);
  assert.equal(plan.requiredEvidence.includes("successful-restore-verification"), true);
  assert.equal(plan.blockers.includes("backup-evidence-missing"), false);
  assert.equal(plan.blockers.includes("explicit-staging-apply-authorization-missing"), true);
  assert.match(plan.manifestDigest, /^[a-f0-9]{64}$/);
  const tables = await withClient(database.url, (client) => client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
  ));
  assert.equal(tables.rows.some((row) => row.name === "hermes_schema_migrations"), false);
});

test("reconciliation and adoption planning reject remote URLs before connecting", async () => {
  await assert.rejects(
    captureReconciliationSnapshot({
      url: "libsql://production.invalid",
      evidenceSalt: EVIDENCE_SALT,
    }),
    (error) => error.code === "LOCAL_DATABASE_REQUIRED",
  );
  await assert.rejects(
    createReadOnlyAdoptionPlan({
      url: "libsql://production.invalid",
      evidenceSalt: EVIDENCE_SALT,
      releaseSha: RELEASE_SHA,
    }),
    (error) => error.code === "LOCAL_DATABASE_REQUIRED",
  );
});

test("read-only evidence refuses a missing local DB instead of creating it", async (t) => {
  const database = await temporaryDatabase(t);
  await assert.rejects(
    captureReconciliationSnapshot({ url: database.url, evidenceSalt: EVIDENCE_SALT }),
    (error) => error.code === "DATABASE_NOT_FOUND",
  );
  await assert.rejects(
    createReadOnlyAdoptionPlan({
      url: database.url,
      evidenceSalt: EVIDENCE_SALT,
      releaseSha: RELEASE_SHA,
    }),
    (error) => error.code === "DATABASE_NOT_FOUND",
  );
  await assert.rejects(access(new URL(database.url)), (error) => error.code === "ENOENT");
});

test("adoption planning exposes missing backup evidence as a hard blocker", async (t) => {
  const database = await temporaryDatabase(t);
  await legacyFixture(database.url);
  const plan = await createReadOnlyAdoptionPlan({
    url: database.url,
    evidenceSalt: EVIDENCE_SALT,
    releaseSha: RELEASE_SHA,
  });
  assert.equal(plan.decision, "blocked");
  assert.equal(plan.blockers.includes("backup-evidence-missing"), true);
});
