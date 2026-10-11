import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
  applyMigration,
  CANONICAL_SCHEMA_FINGERPRINT,
  computeSchemaFingerprint,
  loadMigrationManifest,
  PRE_PUSH_SCHEMA_FINGERPRINT,
} from "./migrate.mjs";

const run = promisify(execFile);
const EXPECTED = Object.freeze({
  owner: "esteban-indiveri",
  database: "beta-hermes",
  id: "01a0c0bd-0601-7f27-b147-915d105b19f2",
  url: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
  migration: "0100-push-delivery-outbox",
});
let lastStage = "start";

function fail(reason) { throw new Error(reason); }
function quoteIdentifier(value) { return `"${value.replaceAll('"', '""')}"`; }

export function assertBetaIdentity(owner, show) {
  if (owner.trim() !== EXPECTED.owner) fail("BETA_IDENTITY_MISMATCH");
  const id = show.match(/^ID:\s*(\S+)\s*$/m)?.[1];
  const url = show.match(/^URL:\s*(\S+)\s*$/m)?.[1];
  if (id !== EXPECTED.id || url !== EXPECTED.url) fail("BETA_DATABASE_MISMATCH");
}

async function cli(configPath, ...args) {
  try {
    const { stdout } = await run("turso", ["-c", configPath, ...args], { maxBuffer: 128 * 1024 });
    return stdout;
  } catch {
    fail("BETA_CLI_FAILED");
  }
}

async function regularLocalPath(path, kind) {
  if (!isAbsolute(path)) fail(`${kind}_PATH_MUST_BE_ABSOLUTE`);
  const info = await lstat(path).catch(() => null);
  if (!info || !info.isFile() || info.isSymbolicLink()) fail(`${kind}_FILE_INVALID`);
}

async function localConfigDirectory(path) {
  if (!isAbsolute(path)) fail("CONFIG_PATH_MUST_BE_ABSOLUTE");
  const info = await lstat(path).catch(() => null);
  if (!info || !info.isDirectory() || info.isSymbolicLink()) fail("CONFIG_DIRECTORY_INVALID");
}

async function tableColumns(client, table) {
  const result = await client.execute(`PRAGMA table_info(${quoteIdentifier(table)})`);
  return result.rows.map((row) => String(row.name));
}

function rowDigest(rows) {
  const sorted = rows.map((row) => JSON.stringify(Array.from(row, (value) =>
    typeof value === "bigint" ? value.toString() : value))).sort();
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

async function tableDigest(client, table, columns) {
  const result = await client.execute(
    `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table)}`,
  );
  return rowDigest(result.rows);
}

async function captureRows(client, columnsByTable) {
  const result = {};
  for (const [table, columns] of Object.entries(columnsByTable)) {
    result[table] = await tableDigest(client, table, columns);
  }
  return result;
}

async function assertIntegrity(client, errorCode = "BETA_INTEGRITY_FAILED") {
  const integrity = await client.execute("PRAGMA integrity_check");
  const foreignKeys = await client.execute("PRAGMA foreign_key_check");
  if (integrity.rows.length !== 1 || String(integrity.rows[0]?.integrity_check) !== "ok" || foreignKeys.rows.length > 0) {
    fail(errorCode);
  }
}

async function ledger(client) {
  const result = await client.execute(
    "SELECT migration_id, checksum FROM hermes_schema_migrations ORDER BY migration_id",
  );
  return result.rows.map((row) => [String(row.migration_id), String(row.checksum)]);
}

async function databaseSnapshot(client, columns) {
  return {
    schema: await computeSchemaFingerprint(client),
    ledger: await ledger(client),
    rows: await captureRows(client, columns),
  };
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--config-path" || argv[2] !== "--backup-db-file") {
    fail("Pass --config-path <isolated-beta-config> --backup-db-file <fresh-local-exported-db>.");
  }
  if (!isAbsolute(argv[1]) || !isAbsolute(argv[3])) fail("CONFIG_AND_BACKUP_PATHS_MUST_BE_ABSOLUTE");
  return { configPath: resolve(argv[1]), backupPath: resolve(argv[3]) };
}

export { parseArgs };

export async function applyBetaPushMigration({ configPath, backupPath }) {
  lastStage = "identity";
  await localConfigDirectory(configPath);
  await regularLocalPath(backupPath, "BACKUP");
  if (resolve(configPath) === resolve(backupPath)) fail("CONFIG_AND_BACKUP_MUST_DIFFER");
  const backupRelativeToConfig = relative(resolve(configPath), resolve(backupPath));
  if (backupRelativeToConfig === "" || (!backupRelativeToConfig.startsWith(`..${sep}`) && backupRelativeToConfig !== ".." && !isAbsolute(backupRelativeToConfig))) {
    fail("BACKUP_MUST_BE_OUTSIDE_CONFIG");
  }

  assertBetaIdentity(
    await cli(configPath, "auth", "whoami"),
    await cli(configPath, "db", "show", EXPECTED.database),
  );
  const manifest = await loadMigrationManifest();
  const pending = manifest.migrations.at(-1);
  if (!pending || pending.id !== EXPECTED.migration || pending.files.length !== 1) fail("MIGRATION_MANIFEST_MISMATCH");

  const backup = createClient({ url: pathToFileURL(backupPath).href });
  let beta;
  try {
    lastStage = "backup-integrity";
    await assertIntegrity(backup, "BACKUP_INTEGRITY_FAILED");
    if (await computeSchemaFingerprint(backup) !== PRE_PUSH_SCHEMA_FINGERPRINT) fail("BACKUP_SCHEMA_MISMATCH");
    const backupLedger = await ledger(backup);
    const expectedLedger = manifest.migrations.slice(0, -1).map((entry) => [entry.id, entry.checksum]);
    if (JSON.stringify(backupLedger) !== JSON.stringify(expectedLedger)) fail("BACKUP_LEDGER_MISMATCH");
    const tables = (await backup.execute(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )).rows.map((row) => String(row.name)).filter((name) => name !== "hermes_schema_migrations");
    const columns = Object.fromEntries(await Promise.all(
      tables.map(async (table) => [table, await tableColumns(backup, table)]),
    ));
    const backupRows = await captureRows(backup, columns);

    lastStage = "beta-token";
    const tokenOutput = await cli(configPath, "db", "tokens", "create", EXPECTED.database, "--expiration", "1d");
    const tokens = tokenOutput.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
    if (tokens.length !== 1) fail("BETA_TOKEN_FORMAT_UNEXPECTED");
    beta = createClient({ url: EXPECTED.url, authToken: tokens[0] });

    lastStage = "beta-preflight";
    const preflight = await databaseSnapshot(beta, columns);
    if (preflight.schema !== PRE_PUSH_SCHEMA_FINGERPRINT) fail("BETA_SCHEMA_DRIFT");
    await assertIntegrity(beta);
    if (JSON.stringify(preflight.ledger) !== JSON.stringify(backupLedger)) fail("BETA_LEDGER_DRIFT");
    if (JSON.stringify(preflight.rows) !== JSON.stringify(backupRows)) fail("BETA_DATA_CHANGED_SINCE_BACKUP");

    // Repeat the complete comparison immediately before opening the write transaction.
    lastStage = "beta-last-preflight";
    const lastPreflight = await databaseSnapshot(beta, columns);
    await assertIntegrity(beta);
    if (JSON.stringify(lastPreflight) !== JSON.stringify(preflight)) fail("BETA_CHANGED_BEFORE_WRITE");

    lastStage = "migration";
    await applyMigration(beta, pending);
    lastStage = "beta-postflight";
    await assertIntegrity(beta);
    if (await computeSchemaFingerprint(beta) !== CANONICAL_SCHEMA_FINGERPRINT) fail("BETA_POST_SCHEMA_MISMATCH");
    if (JSON.stringify(await captureRows(beta, columns)) !== JSON.stringify(backupRows)) fail("BETA_POST_DATA_CHANGED");
    const afterLedger = await ledger(beta);
    if (JSON.stringify(afterLedger) !== JSON.stringify([...backupLedger, [pending.id, pending.checksum]])) {
      fail("BETA_POST_LEDGER_MISMATCH");
    }
    return { database: EXPECTED.database, migrationId: pending.id, verified: true, preservedTables: tables.length };
  } finally {
    beta?.close();
    backup.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  applyBetaPushMigration(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error(`BETA_PUSH_MIGRATION_BLOCKED at ${lastStage}: inspect redacted pre/post evidence; no automatic retry.`);
      process.exitCode = 1;
    });
}
