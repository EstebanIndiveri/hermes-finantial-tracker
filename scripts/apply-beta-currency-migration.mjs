import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import {
  applyMigration,
  CANONICAL_SCHEMA_FINGERPRINT,
  computeSchemaFingerprint,
  loadMigrationManifest,
  PRE_CURRENCY_SCHEMA_FINGERPRINT,
} from "./migrate.mjs";

const run = promisify(execFile);
const EXPECTED = Object.freeze({
  owner: "esteban-indiveri",
  database: "beta-hermes",
  id: "01a0c0bd-0601-7f27-b147-915d105b19f2",
  url: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
  migration: "0090-currency-modes",
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

async function tableColumns(client, table) {
  const result = await client.execute(`PRAGMA table_info(${quoteIdentifier(table)})`);
  return result.rows.map((row) => String(row.name));
}

function rowDigest(rows) {
  const sorted = rows.map((row) => JSON.stringify(Array.from(row, (value) => typeof value === "bigint" ? value.toString() : value))).sort();
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

async function tableDigest(client, table, columns) {
  const sql = `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(table)}`;
  const result = await client.execute(sql);
  return rowDigest(result.rows);
}

async function captureRows(client, columnsByTable) {
  const result = {};
  for (const [table, columns] of Object.entries(columnsByTable)) {
    result[table] = await tableDigest(client, table, columns);
  }
  return result;
}

async function assertIntegrity(client) {
  const integrity = await client.execute("PRAGMA integrity_check");
  const foreignKeys = await client.execute("PRAGMA foreign_key_check");
  if (integrity.rows.length !== 1 || String(integrity.rows[0].integrity_check) !== "ok" || foreignKeys.rows.length > 0) {
    fail("BETA_INTEGRITY_FAILED");
  }
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== "--config-path" || argv[2] !== "--backup-db-file") {
    fail("Pass --config-path <isolated-beta-config> --backup-db-file <restored-local-db>.");
  }
  return { configPath: argv[1], backupPath: argv[3] };
}

export async function applyBetaCurrencyMigration({ configPath, backupPath }) {
  lastStage = "identity";
  if (!(await stat(configPath)).isDirectory() || !(await stat(backupPath)).isFile()) fail("BETA_PREFLIGHT_FILES_MISSING");
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
    await assertIntegrity(backup);
    if (await computeSchemaFingerprint(backup) !== PRE_CURRENCY_SCHEMA_FINGERPRINT) fail("BACKUP_SCHEMA_MISMATCH");
    const backupLedger = await backup.execute("SELECT migration_id, checksum FROM hermes_schema_migrations ORDER BY migration_id");
    if (JSON.stringify(backupLedger.rows.map((row) => [row.migration_id, row.checksum])) !==
      JSON.stringify(manifest.migrations.slice(0, -1).map((entry) => [entry.id, entry.checksum]))) fail("BACKUP_LEDGER_MISMATCH");

    const tables = (await backup.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
      .rows.map((row) => String(row.name)).filter((name) => name !== "hermes_schema_migrations");
    const columns = Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await tableColumns(backup, table)])));
    const backupRows = await captureRows(backup, columns);

    lastStage = "beta-token";
    const tokenOutput = await cli(configPath, "db", "tokens", "create", EXPECTED.database, "--expiration", "1d");
    const tokens = tokenOutput.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
    if (tokens.length !== 1) fail("BETA_TOKEN_FORMAT_UNEXPECTED");
    beta = createClient({ url: EXPECTED.url, authToken: tokens[0] });
    lastStage = "beta-preflight";
    if (await computeSchemaFingerprint(beta) !== PRE_CURRENCY_SCHEMA_FINGERPRINT) fail("BETA_SCHEMA_DRIFT");
    await assertIntegrity(beta);
    const betaLedger = await beta.execute("SELECT migration_id, checksum FROM hermes_schema_migrations ORDER BY migration_id");
    if (JSON.stringify(betaLedger.rows.map((row) => [row.migration_id, row.checksum])) !==
      JSON.stringify(backupLedger.rows.map((row) => [row.migration_id, row.checksum]))) fail("BETA_LEDGER_DRIFT");
    const betaRows = await captureRows(beta, columns);
    if (JSON.stringify(betaRows) !== JSON.stringify(backupRows)) fail("BETA_DATA_CHANGED_SINCE_BACKUP");
    const version = String((await beta.execute("SELECT sqlite_version() AS version")).rows[0]?.version ?? "0");
    if (Number(version.split(".")[0]) < 3 || Number(version.split(".")[1]) < 35) fail("BETA_SQLITE_VERSION_UNSUPPORTED");

    lastStage = "migration";
    await applyMigration(beta, pending);
    lastStage = "beta-postflight";
    await assertIntegrity(beta);
    if (await computeSchemaFingerprint(beta) !== CANONICAL_SCHEMA_FINGERPRINT) fail("BETA_POST_SCHEMA_MISMATCH");
    const afterRows = await captureRows(beta, columns);
    if (JSON.stringify(afterRows) !== JSON.stringify(backupRows)) fail("BETA_POST_DATA_CHANGED");
    const afterLedger = await beta.execute("SELECT migration_id, checksum FROM hermes_schema_migrations ORDER BY migration_id");
    if (afterLedger.rows.length !== manifest.migrations.length ||
      String(afterLedger.rows.at(-1)?.migration_id) !== pending.id ||
      String(afterLedger.rows.at(-1)?.checksum) !== pending.checksum) fail("BETA_POST_LEDGER_MISMATCH");
    return { database: EXPECTED.database, migrationId: pending.id, verified: true, preservedTables: tables.length };
  } finally {
    beta?.close();
    backup.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  applyBetaCurrencyMigration(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => { console.error(`BETA_CURRENCY_MIGRATION_BLOCKED at ${lastStage}: inspect redacted pre/post evidence; no automatic retry.`); process.exitCode = 1; });
}
