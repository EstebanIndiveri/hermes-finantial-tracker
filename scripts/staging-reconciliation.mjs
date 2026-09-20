import { createHash, createHmac } from "node:crypto";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
  RUNNER_VERSION,
  assertLocalDatabaseUrl,
  computeSchemaFingerprint,
  inspectDatabase,
  loadMigrationManifest,
} from "./migrate.mjs";

const TABLE_KEYS = {
  users: ["id"],
  groups: ["id"],
  group_members: ["group_id", "user_id"],
  categories: ["id"],
  transactions: ["id"],
  receipt_imports: ["id"],
  split_sessions: ["id"],
  split_session_members: ["session_id", "user_id", "temp_user_id"],
  splits: ["id"],
  split_payments: ["id"],
  reimbursement_requests: ["id"],
  recurring_expenses: ["id"],
  recurring_executions: ["id"],
  telegram_update_inbox: ["id"],
  telegram_operations: ["operation_id"],
  telegram_delivery_outbox: ["id"],
};

const FINANCIAL_AGGREGATES = {
  transactions: ["amount_ars", "amount_usd"],
  splits: ["total_amount"],
  split_payments: ["amount"],
  reimbursement_requests: ["amount"],
  recurring_expenses: ["amount_ars"],
};

const FINANCIAL_DIMENSIONS = {
  transactions: ["user_id", "group_id", "category_id", "date", "month"],
  splits: ["session_id", "split_type", "status"],
  split_payments: ["session_id", "method"],
  reimbursement_requests: ["transaction_id", "requester_id", "payer_id", "status"],
  recurring_expenses: ["user_id", "group_id", "category_id", "frequency", "is_active"],
};

const ORPHAN_RULES = [
  ["receipt_imports", "transaction_id", "transactions", "id"],
  ["recurring_executions", "recurring_expense_id", "recurring_expenses", "id"],
  ["recurring_executions", "transaction_id", "transactions", "id"],
  ["split_session_members", "session_id", "split_sessions", "id"],
  ["split_session_members", "user_id", "users", "id"],
  ["split_session_members", "temp_user_id", "temp_users", "id"],
  ["splits", "session_id", "split_sessions", "id"],
  ["splits", "created_by_user_id", "users", "id"],
  ["splits", "created_by_temp_id", "temp_users", "id"],
  ["split_payments", "session_id", "split_sessions", "id"],
  ["split_payments", "payer_user_id", "users", "id"],
  ["split_payments", "payer_temp_id", "temp_users", "id"],
  ["split_payments", "payee_user_id", "users", "id"],
  ["split_payments", "payee_temp_id", "temp_users", "id"],
  ["transactions", "user_id", "users", "id"],
  ["transactions", "category_id", "categories", "id"],
  ["transactions", "group_id", "groups", "id"],
  ["groups", "owner_id", "users", "id"],
  ["groups", "partner_id", "users", "id"],
  ["group_members", "group_id", "groups", "id"],
  ["group_members", "user_id", "users", "id"],
  ["reimbursement_requests", "transaction_id", "transactions", "id"],
  ["reimbursement_requests", "requester_id", "users", "id"],
  ["reimbursement_requests", "payer_id", "users", "id"],
];

const RESOURCE_TABLES = {
  reimbursement: "reimbursement_requests",
  split: "splits",
  split_payment: "split_payments",
  transaction: "transactions",
};

const SNAPSHOT_KEYS = [
  "blockingFindings",
  "databaseEvidenceId",
  "evidenceKeyId",
  "financialAggregates",
  "integrity",
  "kind",
  "manifestDigest",
  "readOnlyVerified",
  "redaction",
  "schemaFingerprint",
  "signature",
  "tableInventory",
  "version",
];
const SNAPSHOT_KIND = "hermes-staging-reconciliation";
const SNAPSHOT_VERSION = 2;
const SHA256 = /^[a-f0-9]{64}$/;

function reconciliationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireEvidenceSalt(value) {
  if (typeof value !== "string" || value.length < 16) {
    throw reconciliationError("EVIDENCE_SALT_REQUIRED", "Use a staging-only evidence salt of at least 16 characters.");
  }
}

async function assertExistingLocalDatabase(url) {
  assertLocalDatabaseUrl(url);
  let parsed;
  let path;
  try {
    parsed = new URL(url);
    path = fileURLToPath(parsed);
  } catch {
    throw reconciliationError("INVALID_LOCAL_DATABASE_URL", "Use an absolute file: URL without query or fragment.");
  }
  if (!isAbsolute(path) || parsed.search || parsed.hash || (parsed.hostname && parsed.hostname !== "localhost")) {
    throw reconciliationError("INVALID_LOCAL_DATABASE_URL", "Use an absolute local file: URL without query or fragment.");
  }
  let metadata;
  try {
    metadata = await stat(path);
  } catch {
    throw reconciliationError("DATABASE_NOT_FOUND", "The explicit local rehearsal database does not exist.");
  }
  if (!metadata.isFile()) {
    throw reconciliationError("DATABASE_NOT_FOUND", "The explicit local rehearsal database must be a file.");
  }
  return path;
}

async function tableNames(client) {
  const result = await client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result.rows.map((row) => String(row.name));
}

async function columnNames(client, table) {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return new Set(result.rows.map((row) => String(row.name)));
}

function number(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

async function tableEvidence(client, table, keyColumns, evidenceSalt) {
  const countResult = await client.execute(`SELECT COUNT(*) AS row_count FROM ${table}`);
  const rows = await client.execute(
    `SELECT ${keyColumns.join(", ")} FROM ${table} ORDER BY ${keyColumns.join(", ")}`,
  );
  const protectedKeys = rows.rows.map((row) => {
    const material = keyColumns.map((column) => String(row[column] ?? "<null>")).join("\0");
    return createHmac("sha256", evidenceSalt).update(material).digest("hex");
  });
  return {
    rowCount: number(countResult.rows[0]?.row_count),
    primaryKeySetHash: createHash("sha256").update(protectedKeys.join("\n")).digest("hex"),
  };
}

async function financialEvidence(client, table, columns, keyColumns, availableColumns, evidenceSalt) {
  const expressions = columns.flatMap((column) => [
    `COALESCE(SUM(${column}), 0) AS ${column}_sum`,
    `SUM(CASE WHEN ${column} IS NULL THEN 1 ELSE 0 END) AS ${column}_null`,
    `SUM(CASE WHEN ${column} IS NOT NULL AND typeof(${column}) NOT IN ('integer', 'real') THEN 1 ELSE 0 END) AS ${column}_non_numeric`,
  ]);
  const result = await client.execute(`SELECT COUNT(*) AS row_count, ${expressions.join(", ")} FROM ${table}`);
  const row = result.rows[0] ?? {};
  const dimensions = (FINANCIAL_DIMENSIONS[table] ?? []).filter((column) => availableColumns.has(column));
  const contentColumns = [...new Set([...keyColumns, ...dimensions, ...columns])];
  const contentRows = await client.execute(
    `SELECT ${contentColumns.join(", ")} FROM ${table} ORDER BY ${keyColumns.join(", ")}`,
  );
  const protectedRows = contentRows.rows.map((contentRow) => createHmac("sha256", evidenceSalt)
    .update(JSON.stringify(contentColumns.map((column) => contentRow[column] ?? null)))
    .digest("hex"));
  return {
    rowCount: number(row.row_count),
    sums: Object.fromEntries(columns.map((column) => [column, number(row[`${column}_sum`])])),
    nullCounts: Object.fromEntries(columns.map((column) => [column, number(row[`${column}_null`])])),
    nonNumericCounts: Object.fromEntries(columns.map((column) => [column, number(row[`${column}_non_numeric`])])),
    contentSetHash: createHash("sha256").update(protectedRows.join("\n")).digest("hex"),
    dimensions,
  };
}

async function scalarCount(client, sql) {
  const result = await client.execute(sql);
  return number(result.rows[0]?.count);
}

async function duplicateOperationGroups(client, table, columns) {
  if (!columns.has("operation_id")) return 0;
  return scalarCount(client, `
    SELECT COUNT(*) AS count FROM (
      SELECT operation_id FROM ${table}
      WHERE operation_id IS NOT NULL
      GROUP BY operation_id HAVING COUNT(*) > 1
    )
  `);
}

async function integrityEvidence(client, tables, columnsByTable) {
  const tableSet = new Set(tables);
  const foreignKeys = await client.execute("PRAGMA foreign_key_check");
  const evidence = {
    foreignKeyViolations: foreignKeys.rows.length,
    recurringDuplicateGroups: 0,
    operationDuplicateGroups: {},
    inboxDuplicateUpdates: 0,
    operationDuplicateNamespaces: 0,
    outboxDuplicateDeliveryKeys: 0,
    outboxOrphans: 0,
    invalidInboxStates: 0,
    invalidOperationStates: 0,
    invalidOperationResources: 0,
    invalidOutboxStates: 0,
    businessOrphans: {},
    missingRequiredColumns: {},
    operationResourceOrphans: {},
  };

  function hasRequiredColumns(table, required) {
    if (!tableSet.has(table)) return false;
    const columns = columnsByTable.get(table) ?? new Set();
    const missing = required.filter((column) => !columns.has(column));
    if (missing.length > 0) evidence.missingRequiredColumns[table] = missing.length;
    return missing.length === 0;
  }

  if (hasRequiredColumns("recurring_executions", ["recurring_expense_id", "scheduled_date"])) {
    evidence.recurringDuplicateGroups = await scalarCount(client, `
      SELECT COUNT(*) AS count FROM (
        SELECT recurring_expense_id, scheduled_date
        FROM recurring_executions
        GROUP BY recurring_expense_id, scheduled_date
        HAVING COUNT(*) > 1
      )
    `);
  }
  for (const table of ["transactions", "splits", "split_payments", "reimbursement_requests"]) {
    if (tableSet.has(table)) {
      evidence.operationDuplicateGroups[table] = await duplicateOperationGroups(
        client,
        table,
        columnsByTable.get(table),
      );
    }
  }
  if (hasRequiredColumns("telegram_update_inbox", [
    "attempt_count", "bot_id", "completed_at", "lease_expires_at", "lease_token", "status", "update_id",
  ])) {
    evidence.inboxDuplicateUpdates = await scalarCount(client, `
      SELECT COUNT(*) AS count FROM (
        SELECT bot_id, update_id FROM telegram_update_inbox
        GROUP BY bot_id, update_id HAVING COUNT(*) > 1
      )
    `);
    evidence.invalidInboxStates = await scalarCount(client, `
      SELECT COUNT(*) AS count FROM telegram_update_inbox
      WHERE status NOT IN ('processing', 'completed', 'retryable')
         OR (status = 'completed' AND completed_at IS NULL)
         OR (status = 'processing' AND (lease_token IS NULL OR lease_expires_at IS NULL))
         OR (status != 'processing' AND (lease_token IS NOT NULL OR lease_expires_at IS NOT NULL))
         OR attempt_count < 0
    `);
  }
  let operationSchemaReady = false;
  if (hasRequiredColumns("telegram_operations", [
    "bot_id", "committed_at", "operation_id", "operation_kind", "resource_id", "resource_type", "result_json", "status", "update_id",
  ])) {
    operationSchemaReady = true;
    evidence.operationDuplicateNamespaces = await scalarCount(client, `
      SELECT COUNT(*) AS count FROM (
        SELECT bot_id, update_id, operation_kind FROM telegram_operations
        GROUP BY bot_id, update_id, operation_kind HAVING COUNT(*) > 1
      )
    `);
    evidence.invalidOperationStates = await scalarCount(client, `
      SELECT COUNT(*) AS count FROM telegram_operations
      WHERE status NOT IN ('started', 'committed', 'rejected')
         OR (status = 'committed' AND (committed_at IS NULL OR result_json IS NULL))
         OR (status != 'committed' AND committed_at IS NOT NULL)
    `);
    evidence.invalidOperationResources = await scalarCount(client, `
      SELECT COUNT(*) AS count FROM telegram_operations
      WHERE (status = 'committed' AND (
               (resource_type IS NULL AND resource_id IS NOT NULL)
            OR (resource_type IN ('transaction', 'split', 'split_payment', 'reimbursement') AND resource_id IS NULL)
            OR (resource_type = 'recurring_batch' AND resource_id IS NOT NULL)
            OR (resource_type IS NOT NULL AND resource_type NOT IN ('transaction', 'split', 'split_payment', 'reimbursement', 'recurring_batch'))
            ))
         OR (status != 'committed' AND (resource_type IS NOT NULL OR resource_id IS NOT NULL))
    `);
    for (const [resourceType, resourceTable] of Object.entries(RESOURCE_TABLES)) {
      if (!tableSet.has(resourceTable) || !columnsByTable.get(resourceTable)?.has("id")) continue;
      evidence.operationResourceOrphans[resourceType] = await scalarCount(client, `
        SELECT COUNT(*) AS count
        FROM telegram_operations operation
        LEFT JOIN ${resourceTable} resource ON resource.id = operation.resource_id
        WHERE operation.status = 'committed'
          AND operation.resource_type = '${resourceType}'
          AND resource.id IS NULL
      `);
    }
  }
  if (hasRequiredColumns("telegram_delivery_outbox", [
    "action", "attempt_count", "bot_id", "delivery_key", "lease_expires_at", "lease_token", "message_id", "operation_id", "retention_until", "sent_at", "status", "update_id",
  ])) {
    evidence.outboxDuplicateDeliveryKeys = await scalarCount(client, `
      SELECT COUNT(*) AS count FROM (
        SELECT bot_id, delivery_key FROM telegram_delivery_outbox
        GROUP BY bot_id, delivery_key HAVING COUNT(*) > 1
      )
    `);
    evidence.invalidOutboxStates = await scalarCount(client, `
      SELECT COUNT(*) AS count FROM telegram_delivery_outbox
      WHERE status NOT IN ('pending', 'processing', 'retryable', 'sent', 'dead')
         OR action NOT IN ('send_message', 'edit_message')
         OR (action = 'edit_message' AND message_id IS NULL)
         OR attempt_count < 0
         OR (status = 'processing' AND (lease_token IS NULL OR lease_expires_at IS NULL))
         OR (status != 'processing' AND (lease_token IS NOT NULL OR lease_expires_at IS NOT NULL))
         OR (status = 'sent' AND sent_at IS NULL)
         OR (status IN ('sent', 'dead') AND retention_until IS NULL)
    `);
    if (operationSchemaReady) {
      evidence.outboxOrphans = await scalarCount(client, `
        SELECT COUNT(*) AS count
        FROM telegram_delivery_outbox delivery
        LEFT JOIN telegram_operations operation
          ON operation.operation_id = delivery.operation_id
         AND operation.bot_id = delivery.bot_id
         AND operation.update_id = delivery.update_id
        WHERE operation.operation_id IS NULL
      `);
    }
  }
  for (const [childTable, childColumn, parentTable, parentColumn] of ORPHAN_RULES) {
    if (
      !tableSet.has(childTable) ||
      !tableSet.has(parentTable) ||
      !columnsByTable.get(childTable)?.has(childColumn) ||
      !columnsByTable.get(parentTable)?.has(parentColumn)
    ) continue;
    evidence.businessOrphans[`${childTable}.${childColumn}`] = await scalarCount(client, `
      SELECT COUNT(*) AS count
      FROM ${childTable} child
      LEFT JOIN ${parentTable} parent ON parent.${parentColumn} = child.${childColumn}
      WHERE child.${childColumn} IS NOT NULL AND parent.${parentColumn} IS NULL
    `);
  }
  return evidence;
}

function blockingFindings(integrity) {
  const findings = [];
  function visit(value, path) {
    if (typeof value === "number") {
      if (value > 0) findings.push(path);
      return;
    }
    for (const [name, nested] of Object.entries(value)) visit(nested, path ? `${path}:${name}` : name);
  }
  visit(integrity, "");
  return findings.sort();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function loadedManifestDigest(manifest) {
  const material = {
    runnerVersion: RUNNER_VERSION,
    ledgerTable: "hermes_schema_migrations",
    migrations: manifest.migrations.map((migration) => ({
      id: migration.id,
      files: migration.files.map((file) => ({
        file: file.file,
        sha256: createHash("sha256").update(file.contents).digest("hex"),
      })),
      checksum: migration.checksum,
      preflight: migration.preflight,
    })),
    excluded: manifest.excluded,
  };
  return createHash("sha256").update(canonicalJson(material)).digest("hex");
}

function signedSnapshot(payload, evidenceSalt) {
  return {
    ...payload,
    signature: createHmac("sha256", evidenceSalt).update(canonicalJson(payload)).digest("hex"),
  };
}

function invalidEvidence(message) {
  throw reconciliationError("INVALID_RECONCILIATION_EVIDENCE", message);
}

function plainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidEvidence(`${name} must be an object.`);
  return value;
}

function exactKeys(value, keys, name) {
  const actual = Object.keys(plainObject(value, name)).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) invalidEvidence(`${name} has missing or unknown keys.`);
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) invalidEvidence(`${name} must be a non-negative safe integer.`);
}

function validateNumericLeaves(value, name) {
  const object = plainObject(value, name);
  for (const [key, nested] of Object.entries(object)) {
    if (typeof nested === "number") nonNegativeInteger(nested, `${name}.${key}`);
    else validateNumericLeaves(nested, `${name}.${key}`);
  }
}

function verifySnapshot(snapshot, evidenceSalt) {
  requireEvidenceSalt(evidenceSalt);
  exactKeys(snapshot, SNAPSHOT_KEYS, "snapshot");
  if (snapshot.version !== SNAPSHOT_VERSION || snapshot.kind !== SNAPSHOT_KIND) invalidEvidence("Unsupported evidence format.");
  for (const field of ["schemaFingerprint", "manifestDigest", "databaseEvidenceId", "evidenceKeyId", "signature"]) {
    if (typeof snapshot[field] !== "string" || !SHA256.test(snapshot[field])) invalidEvidence(`${field} must be SHA-256.`);
  }
  if (snapshot.readOnlyVerified !== true) invalidEvidence("The capture did not verify query_only mode.");
  if (snapshot.redaction !== "counts-hmac-content-and-aggregates-only") invalidEvidence("Unexpected redaction contract.");
  plainObject(snapshot.tableInventory, "tableInventory");
  for (const [table, evidence] of Object.entries(snapshot.tableInventory)) {
    if (!(table in TABLE_KEYS)) invalidEvidence(`Unknown table evidence: ${table}.`);
    exactKeys(evidence, ["primaryKeySetHash", "rowCount"], `tableInventory.${table}`);
    nonNegativeInteger(evidence.rowCount, `tableInventory.${table}.rowCount`);
    if (!SHA256.test(evidence.primaryKeySetHash)) invalidEvidence(`tableInventory.${table}.primaryKeySetHash must be SHA-256.`);
  }
  plainObject(snapshot.financialAggregates, "financialAggregates");
  for (const [table, evidence] of Object.entries(snapshot.financialAggregates)) {
    if (!(table in FINANCIAL_AGGREGATES)) invalidEvidence(`Unknown financial evidence: ${table}.`);
    exactKeys(evidence, ["contentSetHash", "dimensions", "nonNumericCounts", "nullCounts", "rowCount", "sums"], `financialAggregates.${table}`);
    nonNegativeInteger(evidence.rowCount, `financialAggregates.${table}.rowCount`);
    if (!SHA256.test(evidence.contentSetHash)) invalidEvidence(`financialAggregates.${table}.contentSetHash must be SHA-256.`);
    if (!Array.isArray(evidence.dimensions) || evidence.dimensions.some((value) => typeof value !== "string")) invalidEvidence(`financialAggregates.${table}.dimensions is invalid.`);
    plainObject(evidence.sums, `financialAggregates.${table}.sums`);
    for (const value of Object.values(evidence.sums)) if (typeof value !== "number" || !Number.isFinite(value)) invalidEvidence(`financialAggregates.${table}.sums is invalid.`);
    validateNumericLeaves(evidence.nullCounts, `financialAggregates.${table}.nullCounts`);
    validateNumericLeaves(evidence.nonNumericCounts, `financialAggregates.${table}.nonNumericCounts`);
  }
  validateNumericLeaves(snapshot.integrity, "integrity");
  if (!Array.isArray(snapshot.blockingFindings) || snapshot.blockingFindings.some((value) => typeof value !== "string")) invalidEvidence("blockingFindings must be strings.");
  if (JSON.stringify(snapshot.blockingFindings) !== JSON.stringify(blockingFindings(snapshot.integrity))) {
    invalidEvidence("blockingFindings does not match integrity evidence.");
  }
  const { signature, ...payload } = snapshot;
  const expectedSignature = createHmac("sha256", evidenceSalt).update(canonicalJson(payload)).digest("hex");
  if (signature !== expectedSignature) invalidEvidence("Evidence signature does not match its payload.");
  return snapshot;
}

export async function captureReconciliationSnapshot({ url, evidenceSalt }) {
  const databasePath = await assertExistingLocalDatabase(url);
  requireEvidenceSalt(evidenceSalt);
  const manifest = await loadMigrationManifest();
  const client = createClient({ url });
  try {
    await client.execute("PRAGMA query_only = ON");
    await client.execute("PRAGMA foreign_keys = ON");
    const queryOnly = await client.execute("PRAGMA query_only");
    if (number(queryOnly.rows[0]?.query_only) !== 1) {
      throw reconciliationError("READ_ONLY_MODE_REQUIRED", "The reconciliation connection did not enter query_only mode.");
    }
    const tables = await tableNames(client);
    const tableSet = new Set(tables);
    const columnsByTable = new Map();
    for (const table of tables) columnsByTable.set(table, await columnNames(client, table));

    const tableInventory = {};
    for (const [table, keys] of Object.entries(TABLE_KEYS)) {
      if (tableSet.has(table) && keys.every((key) => columnsByTable.get(table).has(key))) {
        tableInventory[table] = await tableEvidence(client, table, keys, evidenceSalt);
      }
    }

    const financialAggregates = {};
    for (const [table, columns] of Object.entries(FINANCIAL_AGGREGATES)) {
      if (tableSet.has(table) && columns.every((column) => columnsByTable.get(table).has(column))) {
        financialAggregates[table] = await financialEvidence(
          client,
          table,
          columns,
          TABLE_KEYS[table],
          columnsByTable.get(table),
          evidenceSalt,
        );
      }
    }

    const integrity = await integrityEvidence(client, tables, columnsByTable);
    const payload = {
      version: SNAPSHOT_VERSION,
      kind: SNAPSHOT_KIND,
      schemaFingerprint: await computeSchemaFingerprint(client),
      manifestDigest: loadedManifestDigest(manifest),
      databaseEvidenceId: createHmac("sha256", evidenceSalt).update(`database-path\0${databasePath}`).digest("hex"),
      evidenceKeyId: createHmac("sha256", evidenceSalt).update("hermes-staging-evidence-key-v1").digest("hex"),
      readOnlyVerified: true,
      tableInventory,
      financialAggregates,
      integrity,
      blockingFindings: blockingFindings(integrity),
      redaction: "counts-hmac-content-and-aggregates-only",
    };
    return signedSnapshot(payload, evidenceSalt);
  } finally {
    client.close();
  }
}

export function compareReconciliationSnapshots(
  beforeInput,
  afterInput,
  { evidenceSalt, expectedAfterSchemaFingerprint, expectedAfterManifestDigest, allowedAddedTables = [] } = {},
) {
  const before = verifySnapshot(beforeInput, evidenceSalt);
  const after = verifySnapshot(afterInput, evidenceSalt);
  const differences = [];
  if (allowedAddedTables.some((table) => !(table in TABLE_KEYS))) {
    invalidEvidence("allowedAddedTables contains an unknown table.");
  }
  if (before.evidenceKeyId !== after.evidenceKeyId) differences.push("evidence-key-changed");
  if (before.databaseEvidenceId !== after.databaseEvidenceId) differences.push("database-target-changed");
  if (expectedAfterManifestDigest) {
    if (after.manifestDigest !== expectedAfterManifestDigest) differences.push("unexpected-target-manifest-digest");
  } else if (before.manifestDigest !== after.manifestDigest) differences.push("manifest-digest-changed");
  if (expectedAfterSchemaFingerprint) {
    if (after.schemaFingerprint !== expectedAfterSchemaFingerprint) {
      differences.push("unexpected-target-schema-fingerprint");
    }
  } else if (before.schemaFingerprint !== after.schemaFingerprint) {
    differences.push("schema-fingerprint-changed");
  }
  for (const [table, expected] of Object.entries(before.tableInventory)) {
    const actual = after.tableInventory[table];
    if (!actual) differences.push(`missing-table-evidence:${table}`);
    else if (JSON.stringify(actual) !== JSON.stringify(expected)) differences.push(`table-changed:${table}`);
  }
  const allowedAdditions = new Set(allowedAddedTables);
  for (const table of Object.keys(after.tableInventory)) {
    if (!(table in before.tableInventory) && !allowedAdditions.has(table)) differences.push(`unapproved-added-table-evidence:${table}`);
  }
  for (const [table, expected] of Object.entries(before.financialAggregates)) {
    const actual = after.financialAggregates[table];
    if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) {
      differences.push(`financial-aggregate-changed:${table}`);
    }
  }
  for (const table of Object.keys(after.financialAggregates)) {
    if (!(table in before.financialAggregates) && !allowedAdditions.has(table)) differences.push(`unapproved-added-financial-evidence:${table}`);
  }
  for (const finding of after.blockingFindings) differences.push(`blocking:${finding}`);
  return { ok: differences.length === 0, differences: [...new Set(differences)].sort() };
}

function backupBlockers(backupEvidence) {
  if (backupEvidence === undefined) return ["backup-evidence-missing"];
  exactKeys(
    backupEvidence,
    ["backupId", "backupSha256", "restoredAt", "restoredSha256", "restoreVerified", "version"],
    "backupEvidence",
  );
  if (backupEvidence.version !== 1 || typeof backupEvidence.backupId !== "string" || !SAFE_BACKUP_ID.test(backupEvidence.backupId)) {
    invalidEvidence("backupEvidence identity is invalid.");
  }
  if (!SHA256.test(backupEvidence.backupSha256) || !SHA256.test(backupEvidence.restoredSha256)) {
    invalidEvidence("backupEvidence hashes must be lowercase SHA-256.");
  }
  if (typeof backupEvidence.restoredAt !== "string" || Number.isNaN(Date.parse(backupEvidence.restoredAt))) {
    invalidEvidence("backupEvidence.restoredAt must be an ISO timestamp.");
  }
  const blockers = [];
  if (backupEvidence.restoreVerified !== true) blockers.push("backup-restore-unverified");
  if (backupEvidence.backupSha256 !== backupEvidence.restoredSha256) blockers.push("backup-restore-hash-mismatch");
  return blockers;
}

const SAFE_BACKUP_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

export async function createReadOnlyAdoptionPlan({ url, evidenceSalt, releaseSha, backupEvidence }) {
  if (typeof releaseSha !== "string" || !/^[a-f0-9]{40}$/.test(releaseSha)) {
    throw reconciliationError("INVALID_RELEASE_SHA", "Use the exact 40-character release SHA.");
  }
  await assertExistingLocalDatabase(url);
  const inspection = await inspectDatabase({ url });
  const snapshot = await captureReconciliationSnapshot({ url, evidenceSalt });
  const blockers = new Set(snapshot.blockingFindings);
  if (["partial", "conflict"].includes(inspection.state)) blockers.add(`inspection-state:${inspection.state}`);
  if (!['legacy-unadopted', 'partial', 'conflict'].includes(inspection.state)) {
    blockers.add(`not-an-unmanaged-legacy-database:${inspection.state}`);
  }
  for (const blocker of backupBlockers(backupEvidence)) blockers.add(blocker);
  blockers.add("reviewed-additive-forward-fix-missing");
  blockers.add("expected-post-fix-schema-fingerprint-missing");
  blockers.add("before-after-reconciliation-missing");
  blockers.add("explicit-staging-apply-authorization-missing");

  return {
    version: 1,
    decision: "blocked",
    applyAuthorized: false,
    releaseSha,
    runnerVersion: "1",
    sourceSchemaFingerprint: snapshot.schemaFingerprint,
    manifestDigest: snapshot.manifestDigest,
    inspectionState: inspection.state,
    blockers: [...blockers].sort(),
    requiredEvidence: [
      "isolated-staging-manifest",
      "provider-backup-identifier-and-sha256",
      "successful-restore-verification",
      "reviewed-additive-forward-fix",
      "expected-post-fix-schema-fingerprint",
      "before-after-reconciliation",
      "explicit-staging-apply-authorization",
    ],
    observed: snapshot,
    note: "This read-only plan never infers canonical migrations or authorizes adoption; every missing release gate remains an explicit blocker.",
  };
}
