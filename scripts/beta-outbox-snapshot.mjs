import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { assertBetaIdentity } from "./apply-beta-push-migration.mjs";

const executeFile = promisify(execFile);
const DATABASE = "beta-hermes";
const HEADERS = [
  "CHANNEL", "CLOCK_MS", "TOTAL", "PENDING", "PROCESSING", "RETRYABLE",
  "SENT", "DEAD", "UNKNOWN", "DUE_NOW", "EXPIRED_LEASES", "PURGE_DUE",
  "OLDEST_OPEN_AGE_MINUTES", "MISSING_RETENTION", "INVALID_TIMING",
];

// Fixed aggregate-only SQL. No caller-controlled fragments or raw rows.
export const SNAPSHOT_SQL = `WITH clock AS (SELECT unixepoch() * 1000 AS now_ms),
channels AS (SELECT 'push' AS channel UNION ALL SELECT 'telegram'),
deliveries AS (
  SELECT 'push' AS channel, status, created_at, next_attempt_at,
         lease_expires_at, retention_until FROM push_delivery_outbox
  UNION ALL
  SELECT 'telegram', status, created_at, next_attempt_at,
         lease_expires_at, retention_until FROM telegram_delivery_outbox
)
SELECT channels.channel AS channel, clock.now_ms AS clock_ms,
  COUNT(deliveries.channel) AS total,
  COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
  COALESCE(SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END), 0) AS processing,
  COALESCE(SUM(CASE WHEN status = 'retryable' THEN 1 ELSE 0 END), 0) AS retryable,
  COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
  COALESCE(SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END), 0) AS dead,
  COALESCE(SUM(CASE WHEN deliveries.channel IS NOT NULL AND (status IS NULL OR
    status NOT IN ('pending', 'processing', 'retryable', 'sent', 'dead'))
    THEN 1 ELSE 0 END), 0) AS unknown,
  COALESCE(SUM(CASE WHEN status IN ('pending', 'retryable')
    AND next_attempt_at <= clock.now_ms THEN 1 ELSE 0 END), 0) AS due_now,
  COALESCE(SUM(CASE WHEN status = 'processing'
    AND lease_expires_at <= clock.now_ms THEN 1 ELSE 0 END), 0) AS expired_leases,
  COALESCE(SUM(CASE WHEN status IN ('sent', 'dead')
    AND retention_until <= clock.now_ms THEN 1 ELSE 0 END), 0) AS purge_due,
  COALESCE(CAST((clock.now_ms - MIN(CASE WHEN status IN
    ('pending', 'processing', 'retryable') THEN created_at END)) / 60000 AS INTEGER), -1)
    AS oldest_open_age_minutes,
  COALESCE(SUM(CASE WHEN status IN ('sent', 'dead')
    AND retention_until IS NULL THEN 1 ELSE 0 END), 0) AS missing_retention,
  COALESCE(SUM(CASE WHEN deliveries.channel IS NOT NULL AND (
    created_at IS NULL OR created_at < 0 OR created_at > clock.now_ms + 300000 OR
    (status IN ('pending', 'retryable') AND next_attempt_at IS NULL) OR
    (status = 'processing' AND (lease_expires_at IS NULL OR lease_expires_at < 0))
  ) THEN 1 ELSE 0 END), 0) AS invalid_timing
FROM channels CROSS JOIN clock
LEFT JOIN deliveries ON deliveries.channel = channels.channel
GROUP BY channels.channel, clock.now_ms
ORDER BY channels.channel;`;

function fail(code) {
  throw new Error(code);
}

export function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--config-path" || !isAbsolute(argv[1])) {
    fail("BETA_SNAPSHOT_ARGUMENTS_INVALID");
  }
  return { configPath: resolve(argv[1]) };
}

async function defaultCli(configPath, args) {
  const { stdout } = await executeFile("turso", ["-c", configPath, ...args], {
    timeout: 15_000,
    maxBuffer: 64 * 1024,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
  });
  return stdout;
}

async function callCli(runCli, args) {
  try {
    return await runCli(args);
  } catch {
    fail("BETA_SNAPSHOT_CLI_FAILED");
  }
}

function parseSnapshotTable(output) {
  const lines = output.trim().split(/\r?\n/);
  const headers = lines[0]?.trim().split(/\s{2,}/).map((value) => value.trim().replaceAll(" ", "_"));
  if (lines.length !== 3 || JSON.stringify(headers) !== JSON.stringify(HEADERS)) {
    fail("BETA_SNAPSHOT_OUTPUT_INVALID");
  }

  const channels = {};
  let clockMs = null;
  for (const line of lines.slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== HEADERS.length) fail("BETA_SNAPSHOT_OUTPUT_INVALID");
    const [channel, ...rawNumbers] = fields;
    if ((channel !== "push" && channel !== "telegram") || channels[channel]) {
      fail("BETA_SNAPSHOT_OUTPUT_INVALID");
    }
    const values = rawNumbers.map((value) => Number(value));
    if (rawNumbers.some((value) => !/^-?\d+$/.test(value)) ||
        values.some((value) => !Number.isSafeInteger(value))) {
      fail("BETA_SNAPSHOT_OUTPUT_INVALID");
    }
    const [capturedMs, total, pending, processing, retryable, sent, dead,
      unknown, dueNow, expiredLeases, purgeDue, oldestOpenAgeMinutes,
      missingRetention, invalidTiming] = values;
    if (capturedMs < Date.UTC(2020, 0, 1) || capturedMs >= Date.UTC(2100, 0, 1) ||
        (clockMs !== null && clockMs !== capturedMs) ||
        values.slice(1, 11).some((value) => value < 0) ||
        missingRetention !== 0 || invalidTiming !== 0 || unknown !== 0 ||
        total !== pending + processing + retryable + sent + dead ||
        dueNow > pending + retryable || expiredLeases > processing ||
        purgeDue > sent + dead ||
        (pending + processing + retryable === 0
          ? oldestOpenAgeMinutes !== -1
          : oldestOpenAgeMinutes < 0)) {
      fail("BETA_SNAPSHOT_OUTPUT_INVALID");
    }
    clockMs = capturedMs;
    channels[channel] = {
      byStatus: { pending, processing, retryable, sent, dead },
      dueNow,
      expiredLeases,
      purgeDue,
      oldestOpenAgeMinutes: oldestOpenAgeMinutes === -1 ? null : oldestOpenAgeMinutes,
    };
  }
  if (!channels.push || !channels.telegram) fail("BETA_SNAPSHOT_OUTPUT_INVALID");
  return { capturedAt: new Date(clockMs).toISOString(), channels };
}

export async function observeBetaOutboxes({ configPath, runCli } = {}) {
  if (!configPath || !isAbsolute(configPath)) fail("BETA_CONFIG_INVALID");
  const info = await lstat(configPath).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) fail("BETA_CONFIG_INVALID");
  const cli = runCli ?? ((args) => defaultCli(configPath, args));
  const owner = await callCli(cli, ["auth", "whoami"]);
  const show = await callCli(cli, ["db", "show", DATABASE]);
  assertBetaIdentity(owner, show);
  if (show.match(/^Name:\s*(\S+)\s*$/m)?.[1] !== DATABASE) {
    fail("BETA_DATABASE_MISMATCH");
  }
  const snapshot = parseSnapshotTable(await callCli(cli, ["db", "shell", DATABASE, SNAPSHOT_SQL]));
  return {
    kind: "hermes-beta-outbox-snapshot",
    version: 1,
    capturedAt: snapshot.capturedAt,
    database: DATABASE,
    channels: snapshot.channels,
    redaction: "aggregate-only",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    console.log(JSON.stringify(await observeBetaOutboxes(parseArgs(process.argv.slice(2)))));
  } catch (error) {
    const code = typeof error?.message === "string" && /^BETA_[A-Z_]+$/.test(error.message)
      ? error.message
      : "BETA_SNAPSHOT_BLOCKED";
    console.error(code);
    process.exitCode = 1;
  }
}
