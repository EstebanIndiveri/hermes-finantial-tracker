import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { assertBetaIdentity } from "./apply-beta-push-migration.mjs";

const executeFile = promisify(execFile);
const DATABASE = "beta-hermes";
const HEADERS = [
  "CLOCK_MS", "FIXTURE_ROWS", "PENDING_ROWS", "SOURCE_ACTIVE", "MEMBERSHIPS",
  "CONSENT", "LINKED_CHAT", "OLD_ENOUGH", "OPERATIONS", "SCOPED_OPERATIONS",
  "TODAY_OPERATIONS", "DELIVERIES", "SCOPED_DELIVERIES", "TODAY_DELIVERIES",
  "WRONG_CHAT", "PENDING_DELIVERIES",
  "PROCESSING_DELIVERIES", "RETRYABLE_DELIVERIES", "SENT_DELIVERIES", "DEAD_DELIVERIES",
];

// Fixed QA scope and aggregate-only SQL. No caller-controlled SQL, raw chats,
// IDs, amount, message text, or provider identifiers leave this query.
export const SNAPSHOT_SQL = `WITH clock AS (SELECT unixepoch() * 1000 AS now_ms),
fixture AS (
  SELECT r.id, r.requester_id, r.payer_id, r.created_at, r.status,
         t.group_id, t.status AS source_status, t.deleted_at
  FROM reimbursement_requests r
  JOIN transactions t ON t.id = r.transaction_id
  WHERE r.id = '_UbIZ-RWblrBnknp6G3T5'
),
raw_operations AS (
  SELECT o.operation_id, o.resource_id, o.status, o.resource_type,
    CASE WHEN json_valid(o.result_json) THEN json_extract(o.result_json, '$.requestId') END AS request_id,
    CASE WHEN json_valid(o.result_json) THEN json_extract(o.result_json, '$.groupId') END AS group_id,
    CASE WHEN json_valid(o.result_json) THEN json_extract(o.result_json, '$.argentinaDate') END AS argentina_date
  FROM telegram_operations o
  WHERE o.operation_kind = 'proactive.reimbursement_reminder'
     OR o.update_id LIKE 'cron:reimbursement:%'
),
reminder_operations AS (
  SELECT o.operation_id,
    CASE WHEN o.resource_id = '504b3827-a03e-49a6-acc6-c200f225ca80'
      AND o.status = 'committed' AND o.resource_type = 'reimbursement_reminder'
      AND o.request_id = '_UbIZ-RWblrBnknp6G3T5'
      AND o.group_id = '6a7c238e-8467-4333-8e7e-7db2c626aa07'
      THEN 1 ELSE 0 END AS scoped,
    o.argentina_date
  FROM raw_operations o
),
deliveries AS (
  SELECT d.status, d.chat_id, o.scoped, o.argentina_date
  FROM telegram_delivery_outbox d
  JOIN reminder_operations o ON o.operation_id = d.operation_id
)
SELECT clock.now_ms AS clock_ms,
  (SELECT COUNT(*) FROM fixture) AS fixture_rows,
  (SELECT COUNT(*) FROM fixture WHERE status = 'pending'
    AND payer_id = '504b3827-a03e-49a6-acc6-c200f225ca80'
    AND group_id = '6a7c238e-8467-4333-8e7e-7db2c626aa07') AS pending_rows,
  (SELECT COUNT(*) FROM fixture WHERE source_status = 'active' AND deleted_at IS NULL) AS source_active,
  (SELECT COUNT(DISTINCT gm.user_id) FROM group_members gm JOIN fixture f
    ON gm.group_id = f.group_id AND gm.user_id IN (f.payer_id, f.requester_id)) AS memberships,
  (SELECT COUNT(*) FROM notification_preferences p JOIN fixture f ON p.user_id = f.payer_id
    WHERE p.reimbursements = 1) AS consent,
  (SELECT COUNT(*) FROM users u JOIN fixture f ON u.id = f.payer_id
    WHERE u.telegram_user_id IS NOT NULL AND u.telegram_user_id <> '') AS linked_chat,
  (SELECT COUNT(*) FROM fixture f, clock
    WHERE f.created_at < clock.now_ms - 259200000) AS old_enough,
  (SELECT COUNT(*) FROM reminder_operations) AS operations,
  (SELECT COUNT(*) FROM reminder_operations WHERE scoped = 1) AS scoped_operations,
  (SELECT COUNT(*) FROM reminder_operations, clock WHERE scoped = 1
    AND argentina_date = date(clock.now_ms / 1000, 'unixepoch', '-3 hours')) AS today_operations,
  (SELECT COUNT(*) FROM deliveries) AS deliveries,
  (SELECT COUNT(*) FROM deliveries WHERE scoped = 1) AS scoped_deliveries,
  (SELECT COUNT(*) FROM deliveries, clock WHERE scoped = 1
    AND argentina_date = date(clock.now_ms / 1000, 'unixepoch', '-3 hours')) AS today_deliveries,
  (SELECT COUNT(*) FROM deliveries d, clock WHERE d.scoped = 1
    AND d.argentina_date = date(clock.now_ms / 1000, 'unixepoch', '-3 hours')
    AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = '504b3827-a03e-49a6-acc6-c200f225ca80'
      AND u.telegram_user_id = d.chat_id)) AS wrong_chat,
  (SELECT COUNT(*) FROM deliveries, clock WHERE scoped = 1 AND status = 'pending'
    AND argentina_date = date(clock.now_ms / 1000, 'unixepoch', '-3 hours')) AS pending_deliveries,
  (SELECT COUNT(*) FROM deliveries, clock WHERE scoped = 1 AND status = 'processing'
    AND argentina_date = date(clock.now_ms / 1000, 'unixepoch', '-3 hours')) AS processing_deliveries,
  (SELECT COUNT(*) FROM deliveries, clock WHERE scoped = 1 AND status = 'retryable'
    AND argentina_date = date(clock.now_ms / 1000, 'unixepoch', '-3 hours')) AS retryable_deliveries,
  (SELECT COUNT(*) FROM deliveries, clock WHERE scoped = 1 AND status = 'sent'
    AND argentina_date = date(clock.now_ms / 1000, 'unixepoch', '-3 hours')) AS sent_deliveries,
  (SELECT COUNT(*) FROM deliveries, clock WHERE scoped = 1 AND status = 'dead'
    AND argentina_date = date(clock.now_ms / 1000, 'unixepoch', '-3 hours')) AS dead_deliveries
FROM clock;`;

function fail(code) { throw new Error(code); }

export function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--config-path" || !isAbsolute(argv[1])) {
    fail("BETA_REMINDER_ARGUMENTS_INVALID");
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

async function callCli(cli, args) {
  try { return await cli(args); } catch { fail("BETA_REMINDER_CLI_FAILED"); }
}

export function parseSnapshotTable(output) {
  const lines = output.trim().split(/\r?\n/);
  const headers = lines[0]?.trim().split(/\s{2,}/).map((value) => value.trim().replaceAll(" ", "_"));
  if (lines.length !== 2 || JSON.stringify(headers) !== JSON.stringify(HEADERS)) {
    fail("BETA_REMINDER_OUTPUT_INVALID");
  }
  const fields = lines[1].trim().split(/\s+/);
  if (fields.length !== HEADERS.length || fields.some((value) => !/^\d+$/.test(value))) {
    fail("BETA_REMINDER_OUTPUT_INVALID");
  }
  const values = fields.map(Number);
  if (values.some((value) => !Number.isSafeInteger(value))) fail("BETA_REMINDER_OUTPUT_INVALID");
  const [clockMs, fixtureRows, pendingRows, sourceActive, memberships, consent,
    linkedChat, oldEnough, operations, scopedOperations, todayOperations,
    deliveries, scopedDeliveries, todayDeliveries, wrongChat,
    pending, processing, retryable, sent, dead] = values;
  if (clockMs < Date.UTC(2020, 0, 1) || clockMs >= Date.UTC(2100, 0, 1) ||
      fixtureRows > 1 || pendingRows > 1 || sourceActive > 1 || memberships > 2 ||
      consent > 1 || linkedChat > 1 || oldEnough > 1 || scopedOperations > operations ||
      todayOperations > scopedOperations || scopedDeliveries > deliveries ||
      todayDeliveries > scopedDeliveries || wrongChat > scopedDeliveries ||
      pending + processing + retryable + sent + dead !== todayDeliveries) {
    fail("BETA_REMINDER_OUTPUT_INVALID");
  }
  const outsideScope = operations - scopedOperations + deliveries - scopedDeliveries;
  const eligible = pendingRows === 1 && sourceActive === 1 && memberships === 2 &&
    consent === 1 && linkedChat === 1 && oldEnough === 1;
  const verdict = outsideScope > 0 || wrongChat > 0 ? "scope_violation"
    : fixtureRows === 0 ? "fixture_missing"
    : sent > 1 || todayOperations > 1 || todayDeliveries > 1 ? "duplicate_today"
    : sent === 1 ? "sent"
    : dead > 0 ? "dead"
    : pending + processing + retryable > 0 ? "queued"
    : todayOperations > 0 ? "operation_without_delivery"
    : eligible ? "eligible_unqueued" : "awaiting_eligibility";
  return {
    kind: "hermes-beta-reimbursement-reminder-snapshot",
    version: 1,
    capturedAt: new Date(clockMs).toISOString(),
    database: DATABASE,
    fixture: { pending: pendingRows === 1, sourceActive: sourceActive === 1,
      memberships, consent: consent === 1, linkedChat: linkedChat === 1,
      oldEnough: oldEnough === 1, eligible },
    operations: { total: operations, scoped: scopedOperations, today: todayOperations },
    deliveries: { total: deliveries, scoped: scopedDeliveries, today: todayDeliveries,
      wrongChat, todayByStatus: { pending, processing, retryable, sent, dead } },
    verdict,
    redaction: "aggregate-only",
  };
}

export async function observeBetaReimbursementReminder({ configPath, runCli } = {}) {
  if (!configPath || !isAbsolute(configPath)) fail("BETA_REMINDER_CONFIG_INVALID");
  const info = await lstat(configPath).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) fail("BETA_REMINDER_CONFIG_INVALID");
  const cli = runCli ?? ((args) => defaultCli(configPath, args));
  const owner = await callCli(cli, ["auth", "whoami"]);
  const show = await callCli(cli, ["db", "show", DATABASE]);
  assertBetaIdentity(owner, show);
  if (show.match(/^Name:\s*(\S+)\s*$/m)?.[1] !== DATABASE) fail("BETA_REMINDER_DATABASE_MISMATCH");
  return parseSnapshotTable(await callCli(cli, ["db", "shell", DATABASE, SNAPSHOT_SQL]));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    console.log(JSON.stringify(await observeBetaReimbursementReminder(parseArgs(process.argv.slice(2)))));
  } catch (error) {
    const code = typeof error?.message === "string" && /^BETA_[A-Z_]+$/.test(error.message)
      ? error.message : "BETA_REMINDER_BLOCKED";
    console.error(code);
    process.exitCode = 1;
  }
}
