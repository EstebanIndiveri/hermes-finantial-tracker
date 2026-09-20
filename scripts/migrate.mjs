import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";

export const RUNNER_VERSION = "1";
export const CANONICAL_SCHEMA_FINGERPRINT = "309646a60fcdfc1566e6110cc4e5ec8eb32cbfdb1ffa4ee03a3d838d54014701";
export const DEFAULT_MANIFEST_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../lib/db/migrations/manifest.json",
);

const LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS hermes_schema_migrations (
  migration_id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  runner_version TEXT NOT NULL
)`;

const SCHEMA_REQUIREMENTS = {
  "0000-base": {
    tables: ["bot_messages", "budgets", "categories", "monthly_settings", "transactions", "users"],
    indexes: ["bot_messages_telegram_update_id_unique", "tx_category_idx", "tx_user_month_idx"],
  },
  "0010-receipt-imports": {
    tables: ["receipt_imports"],
  },
  "0020-groups-auth": {
    tables: ["group_invitations", "group_members", "groups", "telegram_link_codes"],
    columns: {
      groups: ["partner_id"],
      transactions: ["group_id"],
      users: ["username", "personal_token_hash", "active_telegram_group_id", "onboarding_completed_at"],
    },
    indexes: [
      "budgets_group_month_cat_idx",
      "categories_slug_group_idx",
      "gi_token_idx",
      "gm_group_user_idx",
      "ms_group_month_idx",
      "tx_group_id_idx",
    ],
  },
  "0030-splits": {
    tables: [
      "bot_conversation_state",
      "split_items",
      "split_payers",
      "split_payments",
      "split_session_members",
      "split_sessions",
      "splits",
      "temp_users",
    ],
  },
  "0040-split-constraints": {
    indexes: ["si_split_idx", "sp_split_idx", "spm_session_idx", "ssm_session_idx"],
  },
  "0050-recurring": {
    tables: ["recurring_executions", "recurring_expenses"],
    indexes: ["execution_date_idx", "execution_recurring_idx", "execution_status_idx", "recurring_active_idx", "recurring_user_idx"],
  },
  "0060-legacy-schema-reconciliation": {
    tables: ["push_subscriptions", "reimbursement_requests", "user_payment_info"],
    columns: { transactions: ["requires_reimbursement"] },
  },
  "0070-telegram-inbox": {
    tables: ["telegram_update_inbox"],
    indexes: ["telegram_update_inbox_bot_update_idx", "telegram_update_inbox_claim_idx"],
  },
  "0080-telegram-operations-outbox": {
    tables: ["telegram_delivery_outbox", "telegram_operations"],
    columns: {
      reimbursement_requests: ["operation_id"],
      split_payments: ["operation_id"],
      splits: ["operation_id"],
      transactions: ["operation_id"],
    },
    indexes: [
      "execution_recurring_date_idx",
      "reimbursement_requests_operation_id_idx",
      "split_payments_operation_id_idx",
      "splits_operation_id_idx",
      "telegram_delivery_outbox_claim_idx",
      "telegram_delivery_outbox_delivery_key_idx",
      "telegram_operations_namespace_idx",
      "telegram_operations_update_kind_idx",
      "transactions_operation_id_idx",
    ],
    operationNamespaceForeignKey: true,
  },
};

const ALLOWED_PREFLIGHTS = new Set(["recurring-duplicates"]);

function migrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function assertLocalDatabaseUrl(url) {
  if (typeof url !== "string" || !url.startsWith("file:")) {
    throw migrationError(
      "LOCAL_DATABASE_REQUIRED",
      "H04c only accepts an explicit local file: URL; remote migration and adoption are disabled.",
    );
  }
}

function sqlFileNames(entries) {
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function loadMigrationManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  const absoluteManifestPath = resolve(manifestPath);
  const migrationDirectory = dirname(absoluteManifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));

  if (manifest.version !== 1 || manifest.ledgerTable !== "hermes_schema_migrations") {
    throw migrationError("INVALID_MANIFEST", "Unsupported migration manifest version or ledger table.");
  }
  if (!Array.isArray(manifest.migrations) || !Array.isArray(manifest.excluded)) {
    throw migrationError("INVALID_MANIFEST", "Manifest migrations and excluded entries must be arrays.");
  }

  const migrationIds = new Set();
  const classifiedFiles = new Map();
  const loadedMigrations = [];

  for (const migration of manifest.migrations) {
    if (!migration.id || migrationIds.has(migration.id) || !Array.isArray(migration.files) || migration.files.length === 0) {
      throw migrationError("INVALID_MANIFEST", `Invalid or duplicate migration id: ${migration.id ?? "<missing>"}.`);
    }
    migrationIds.add(migration.id);

    const loadedFiles = [];
    for (const file of migration.files) {
      if (classifiedFiles.has(file)) {
        throw migrationError("INVALID_MANIFEST", `SQL file classified more than once: ${file}.`);
      }
      classifiedFiles.set(file, `migration:${migration.id}`);
      const contents = await readFile(resolve(migrationDirectory, file), "utf8");
      loadedFiles.push({ file, contents });
    }

    const preflight = migration.preflight ?? [];
    if (!Array.isArray(preflight) || preflight.some((name) => !ALLOWED_PREFLIGHTS.has(name))) {
      throw migrationError("INVALID_MANIFEST", `Migration ${migration.id} has an unsupported preflight.`);
    }
    if (
      loadedFiles.some(({ file }) => file === "0010_telegram_operations_outbox.sql") &&
      !preflight.includes("recurring-duplicates")
    ) {
      throw migrationError(
        "INVALID_MANIFEST",
        "The Telegram operations/outbox migration requires the recurring-duplicates preflight.",
      );
    }

    const checksumMaterial = loadedFiles
      .map(({ file, contents }) => `${file}\0${sha256(contents)}`)
      .join("\n");
    loadedMigrations.push({
      id: migration.id,
      files: loadedFiles,
      checksum: sha256(checksumMaterial),
      preflight,
    });
  }

  for (const excluded of manifest.excluded) {
    if (!excluded.file || !excluded.reason || classifiedFiles.has(excluded.file)) {
      throw migrationError("INVALID_MANIFEST", `Invalid or duplicate excluded SQL file: ${excluded.file ?? "<missing>"}.`);
    }
    classifiedFiles.set(excluded.file, "excluded");
  }

  const diskSqlFiles = sqlFileNames(await readdir(migrationDirectory));
  const unclassified = diskSqlFiles.filter((file) => !classifiedFiles.has(file));
  const missing = [...classifiedFiles.keys()].filter((file) => !diskSqlFiles.includes(file));
  if (unclassified.length > 0 || missing.length > 0) {
    throw migrationError(
      "MANIFEST_COVERAGE_ERROR",
      `Every SQL file must be included or excluded. Unclassified: ${unclassified.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}.`,
    );
  }

  return {
    manifestPath: absoluteManifestPath,
    migrationDirectory,
    migrations: loadedMigrations,
    excluded: manifest.excluded,
  };
}

async function tableNames(client) {
  const result = await client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result.rows.map((row) => String(row.name));
}

async function tableExists(client, name) {
  const result = await client.execute({
    sql: "SELECT 1 AS present FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1",
    args: [name],
  });
  return result.rows.length === 1;
}

async function columnNames(client, table) {
  if (!(await tableExists(client, table))) return [];
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return result.rows.map((row) => String(row.name));
}

async function readLedger(client) {
  if (!(await tableExists(client, "hermes_schema_migrations"))) return [];
  const result = await client.execute(
    "SELECT migration_id, checksum, applied_at, runner_version FROM hermes_schema_migrations ORDER BY applied_at, migration_id",
  );
  return result.rows.map((row) => ({
    migrationId: String(row.migration_id),
    checksum: String(row.checksum),
    appliedAt: Number(row.applied_at),
    runnerVersion: String(row.runner_version),
  }));
}

function validateLedger(ledger, migrations) {
  const expectedById = new Map(migrations.map((migration) => [migration.id, migration]));
  const conflicts = [];
  for (const entry of ledger) {
    const expected = expectedById.get(entry.migrationId);
    if (!expected) {
      conflicts.push({ migrationId: entry.migrationId, reason: "unknown-migration" });
    } else if (expected.checksum !== entry.checksum) {
      conflicts.push({ migrationId: entry.migrationId, reason: "checksum-mismatch" });
    }
  }
  const appliedIds = new Set(ledger.map((entry) => entry.migrationId));
  let foundGap = false;
  for (const migration of migrations) {
    if (!appliedIds.has(migration.id)) {
      foundGap = true;
    } else if (foundGap) {
      conflicts.push({ migrationId: migration.id, reason: "non-contiguous-history" });
    }
  }
  const expectedAppliedOrder = migrations
    .filter((migration) => appliedIds.has(migration.id))
    .map((migration) => migration.id);
  const recordedOrder = ledger.map((entry) => entry.migrationId);
  if (recordedOrder.some((id, index) => id !== expectedAppliedOrder[index])) {
    conflicts.push({ migrationId: recordedOrder[0] ?? "<empty>", reason: "out-of-order-history" });
  }
  return conflicts;
}

async function indexNames(client) {
  const result = await client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result.rows.map((row) => String(row.name));
}

export async function computeSchemaFingerprint(client) {
  const result = await client.execute(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
      AND name != 'hermes_schema_migrations'
      AND sql IS NOT NULL
    ORDER BY type, name
  `);
  const definitions = result.rows.map((row) => ({
    type: String(row.type),
    name: String(row.name),
    table: String(row.tbl_name),
    sql: String(row.sql).replace(/\s+/g, " ").trim(),
  }));
  return sha256(JSON.stringify(definitions));
}

async function canonicalSchemaDrift(client, tables, appliedMigrationIds) {
  const drift = [];
  const tableSet = new Set(tables);
  const requirements = [...appliedMigrationIds]
    .map((migrationId) => SCHEMA_REQUIREMENTS[migrationId])
    .filter(Boolean);
  const requiredTables = new Set(requirements.flatMap((requirement) => requirement.tables ?? []));
  const requiredIndexes = new Set(requirements.flatMap((requirement) => requirement.indexes ?? []));
  const requiredColumns = new Map();
  for (const requirement of requirements) {
    for (const [table, columns] of Object.entries(requirement.columns ?? {})) {
      const accumulated = requiredColumns.get(table) ?? new Set();
      for (const column of columns) accumulated.add(column);
      requiredColumns.set(table, accumulated);
    }
  }

  for (const table of requiredTables) {
    if (!tableSet.has(table)) drift.push(`missing-table:${table}`);
  }
  for (const [table, columnsForTable] of requiredColumns) {
    if (!tableSet.has(table)) continue;
    const columns = new Set(await columnNames(client, table));
    for (const column of columnsForTable) {
      if (!columns.has(column)) drift.push(`missing-column:${table}.${column}`);
    }
  }
  const indexes = new Set(await indexNames(client));
  for (const index of requiredIndexes) {
    if (!indexes.has(index)) drift.push(`missing-index:${index}`);
  }

  if (requirements.some((requirement) => requirement.operationNamespaceForeignKey) && tableSet.has("telegram_delivery_outbox")) {
    const foreignKeys = await client.execute("PRAGMA foreign_key_list(telegram_delivery_outbox)");
    const operationNamespaceColumns = foreignKeys.rows
      .filter((row) => row.table === "telegram_operations")
      .map((row) => `${row.from}->${row.to}`)
      .sort();
    const expected = ["bot_id->bot_id", "operation_id->operation_id", "update_id->update_id"].sort();
    if (JSON.stringify(operationNamespaceColumns) !== JSON.stringify(expected)) {
      drift.push("invalid-foreign-key:telegram_delivery_outbox.operation_namespace");
    }
  }
  const canonicalIds = Object.keys(SCHEMA_REQUIREMENTS);
  if (canonicalIds.every((migrationId) => appliedMigrationIds.has(migrationId))) {
    const fingerprint = await computeSchemaFingerprint(client);
    if (fingerprint !== CANONICAL_SCHEMA_FINGERPRINT) {
      drift.push("schema-fingerprint-mismatch");
    }
  }
  return drift;
}

async function recurringDuplicateCount(client) {
  if (!(await tableExists(client, "recurring_executions"))) return 0;
  const result = await client.execute(`
    SELECT COUNT(*) AS duplicate_groups
    FROM (
      SELECT recurring_expense_id, scheduled_date
      FROM recurring_executions
      GROUP BY recurring_expense_id, scheduled_date
      HAVING COUNT(*) > 1
    )
  `);
  return Number(result.rows[0]?.duplicate_groups ?? 0);
}

async function foreignKeyViolationCount(client) {
  const result = await client.execute("PRAGMA foreign_key_check");
  return result.rows.length;
}

async function inspectWithClient(client, loadedManifest) {
  const tables = await tableNames(client);
  const hasLedger = tables.includes("hermes_schema_migrations");
  const ledger = await readLedger(client);
  const conflicts = validateLedger(ledger, loadedManifest.migrations);
  const appTables = tables.filter((table) => table !== "hermes_schema_migrations");
  const operationColumns = {
    transactions: (await columnNames(client, "transactions")).includes("operation_id"),
    splits: (await columnNames(client, "splits")).includes("operation_id"),
    split_payments: (await columnNames(client, "split_payments")).includes("operation_id"),
    reimbursement_requests: (await columnNames(client, "reimbursement_requests")).includes("operation_id"),
  };
  const h04Signals = [
    ...Object.values(operationColumns),
    tables.includes("telegram_update_inbox"),
    tables.includes("telegram_operations"),
    tables.includes("telegram_delivery_outbox"),
  ];
  const h04SignalCount = h04Signals.filter(Boolean).length;
  const expectedH04Signals = h04Signals.length;
  const appliedMigrationIds = new Set(ledger.map((entry) => entry.migrationId));
  const schemaDrift = await canonicalSchemaDrift(client, tables, appliedMigrationIds);

  let state;
  if (hasLedger) {
    state = conflicts.length > 0 || (ledger.length === loadedManifest.migrations.length && schemaDrift.length > 0)
      ? "conflict"
      : ledger.length === loadedManifest.migrations.length
        ? "canonical"
        : "partial";
  } else if (appTables.length === 0) {
    state = "empty";
  } else if (h04SignalCount > 0 && h04SignalCount < expectedH04Signals) {
    state = "partial";
  } else {
    state = "legacy-unadopted";
  }

  const foreignKeys = await client.execute("PRAGMA foreign_keys");
  return {
    state,
    tables,
    appliedMigrationIds: ledger.map((entry) => entry.migrationId),
    pendingMigrationIds: loadedManifest.migrations
      .filter((migration) => !ledger.some((entry) => entry.migrationId === migration.id))
      .map((migration) => migration.id),
    conflicts,
    schemaDrift,
    preflight: {
      foreignKeysEnabled: Number(foreignKeys.rows[0]?.foreign_keys ?? 0) === 1,
      foreignKeyViolationCount: await foreignKeyViolationCount(client),
      recurringDuplicateGroups: await recurringDuplicateCount(client),
      operationColumns,
    },
  };
}

export async function inspectDatabase({ url, manifestPath = DEFAULT_MANIFEST_PATH }) {
  assertLocalDatabaseUrl(url);
  const loadedManifest = await loadMigrationManifest(manifestPath);
  const client = createClient({ url });
  try {
    await client.execute("PRAGMA query_only = ON");
    await client.execute("PRAGMA foreign_keys = ON");
    return await inspectWithClient(client, loadedManifest);
  } finally {
    client.close();
  }
}

async function assertOutboxPreflight(client) {
  const duplicateGroups = await recurringDuplicateCount(client);
  if (duplicateGroups > 0) {
    throw migrationError(
      "RECURRING_DUPLICATES",
      `Cannot create the recurring uniqueness constraint: ${duplicateGroups} duplicate group(s) found.`,
    );
  }
}

async function applyMigration(client, migration) {
  if (migration.preflight.includes("recurring-duplicates")) {
    await assertOutboxPreflight(client);
  }

  const transaction = await client.transaction("write");
  let finished = false;
  try {
    await transaction.execute(LEDGER_DDL);
    for (const file of migration.files) {
      await transaction.executeMultiple(file.contents);
    }
    const foreignKeyViolations = await transaction.execute("PRAGMA foreign_key_check");
    if (foreignKeyViolations.rows.length > 0) {
      throw migrationError(
        "FOREIGN_KEY_VIOLATION",
        `Migration ${migration.id} produced ${foreignKeyViolations.rows.length} foreign key violation(s).`,
      );
    }
    await transaction.execute({
      sql: `INSERT INTO hermes_schema_migrations
        (migration_id, checksum, applied_at, runner_version)
        VALUES (?, ?, ?, ?)`,
      args: [migration.id, migration.checksum, Date.now(), RUNNER_VERSION],
    });
    await transaction.commit();
    finished = true;
  } catch (error) {
    if (!finished) {
      await transaction.rollback();
      finished = true;
    }
    throw error;
  } finally {
    transaction.close();
  }
}

export async function migrateDatabase({ url, manifestPath = DEFAULT_MANIFEST_PATH }) {
  assertLocalDatabaseUrl(url);
  const loadedManifest = await loadMigrationManifest(manifestPath);
  const client = createClient({ url });
  const applied = [];

  try {
    await client.execute("PRAGMA foreign_keys = ON");
    const initialTables = await tableNames(client);
    const hasLedger = initialTables.includes("hermes_schema_migrations");
    if (!hasLedger && initialTables.length > 0) {
      throw migrationError(
        "LEGACY_UNADOPTED",
        "The database is not empty and has no Hermes migration ledger. Inspect it first; H04c will not adopt or modify it.",
      );
    }

    const ledger = await readLedger(client);
    const conflicts = validateLedger(ledger, loadedManifest.migrations);
    if (conflicts.length > 0) {
      throw migrationError(
        "LEDGER_CONFLICT",
        `Migration ledger conflict: ${conflicts.map((conflict) => `${conflict.migrationId}:${conflict.reason}`).join(", ")}.`,
      );
    }
    if (hasLedger) {
      const initialInspection = await inspectWithClient(client, loadedManifest);
      if (initialInspection.schemaDrift.length > 0) {
        throw migrationError(
          "SCHEMA_DRIFT",
          `Managed schema drift detected: ${initialInspection.schemaDrift.join(", ")}.`,
        );
      }
    }

    const appliedIds = new Set(ledger.map((entry) => entry.migrationId));
    for (const migration of loadedManifest.migrations) {
      if (appliedIds.has(migration.id)) continue;
      await applyMigration(client, migration);
      applied.push(migration.id);
    }

    const finalInspection = await inspectWithClient(client, loadedManifest);
    if (finalInspection.state !== "canonical" || finalInspection.preflight.foreignKeyViolationCount !== 0) {
      throw migrationError("POST_MIGRATION_VERIFICATION_FAILED", "Canonical post-migration verification failed.");
    }
    return { appliedMigrationIds: applied, inspection: finalInspection };
  } finally {
    client.close();
  }
}

function parseCliArgs(argv) {
  const [command, ...rest] = argv;
  let url;
  let manifestPath = DEFAULT_MANIFEST_PATH;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--url") url = rest[++index];
    else if (rest[index] === "--manifest") manifestPath = resolve(rest[++index]);
    else throw migrationError("INVALID_ARGUMENT", `Unknown argument: ${rest[index]}.`);
  }
  if (!url) {
    throw migrationError("MISSING_DATABASE_URL", "Pass an explicit local database with --url file:/absolute/path.db.");
  }
  return { command, url, manifestPath };
}

async function main() {
  const { command, url, manifestPath } = parseCliArgs(process.argv.slice(2));
  if (command === "inspect") {
    console.log(JSON.stringify(await inspectDatabase({ url, manifestPath }), null, 2));
    return;
  }
  if (command === "migrate") {
    console.log(JSON.stringify(await migrateDatabase({ url, manifestPath }), null, 2));
    return;
  }
  throw migrationError("INVALID_COMMAND", "Use either inspect or migrate.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(`${error.code ?? "MIGRATION_FAILED"}: ${error.message}`);
    process.exitCode = 1;
  });
}
