import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import {
  observeBetaReimbursementReminder, parseArgs, parseSnapshotTable, SNAPSHOT_SQL,
} from "../beta-reimbursement-reminder-snapshot.mjs";

const betaShow = `Name: beta-hermes
URL: libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io
ID: 01a0c0bd-0601-7f27-b147-915d105b19f2
`;
const payer = "504b3827-a03e-49a6-acc6-c200f225ca80";
const requester = "e6fc70f7-9564-4516-bb74-44b81bec9e29";
const group = "6a7c238e-8467-4333-8e7e-7db2c626aa07";
const request = "_UbIZ-RWblrBnknp6G3T5";

function asTable(result) {
  return `${result.columns.map((name) => name.toUpperCase().replaceAll("_", " ")).join("   ")}
${result.columns.map((name) => String(result.rows[0][name])).join("   ")}
`;
}

function todayArgentina() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "hermes-beta-reminder-snapshot-"));
  const client = createClient({ url: `file:${join(directory, "snapshot.db")}` });
  t.after(async () => { client.close(); await rm(directory, { recursive: true, force: true }); });
  await client.executeMultiple(`
    CREATE TABLE reimbursement_requests (id TEXT, transaction_id TEXT, requester_id TEXT,
      payer_id TEXT, created_at INTEGER, status TEXT);
    CREATE TABLE transactions (id TEXT, group_id TEXT, status TEXT, deleted_at INTEGER);
    CREATE TABLE group_members (group_id TEXT, user_id TEXT);
    CREATE TABLE notification_preferences (user_id TEXT, reimbursements INTEGER);
    CREATE TABLE users (id TEXT, telegram_user_id TEXT);
    CREATE TABLE telegram_operations (operation_id TEXT, resource_id TEXT, status TEXT,
      resource_type TEXT, result_json TEXT, operation_kind TEXT, update_id TEXT);
    CREATE TABLE telegram_delivery_outbox (operation_id TEXT, status TEXT, chat_id TEXT);
  `);
  await client.execute({ sql: "INSERT INTO transactions VALUES ('expense', ?, 'active', NULL)", args: [group] });
  await client.execute({ sql: "INSERT INTO reimbursement_requests VALUES (?, 'expense', ?, ?, ?, 'pending')",
    args: [request, requester, payer, Date.now() - 4 * 24 * 60 * 60 * 1000] });
  await client.execute({ sql: "INSERT INTO group_members VALUES (?, ?), (?, ?)",
    args: [group, requester, group, payer] });
  await client.execute({ sql: "INSERT INTO notification_preferences VALUES (?, 1)", args: [payer] });
  await client.execute({ sql: "INSERT INTO users VALUES (?, 'qa-chat'), (?, NULL)", args: [payer, requester] });
  return client;
}

async function observe(client) {
  return parseSnapshotTable(asTable(await client.execute(SNAPSHOT_SQL)));
}

async function insertReminder(client, { id, date = todayArgentina(), recipient = payer,
  chat = "qa-chat", requestId = request, groupId = group, status = "sent" }) {
  await client.execute({
    sql: `INSERT INTO telegram_operations VALUES (?, ?, 'committed', 'reimbursement_reminder',
      ?, 'proactive.reimbursement_reminder', ?)`,
    args: [id, recipient, JSON.stringify({ requestId, groupId, argentinaDate: date }),
      `cron:reimbursement:${id}`],
  });
  await client.execute({ sql: "INSERT INTO telegram_delivery_outbox VALUES (?, ?, ?)",
    args: [id, status, chat] });
}

test("requires an absolute isolated config directory and no SQL arguments", () => {
  assert.deepEqual(parseArgs(["--config-path", "/tmp/beta-config"]),
    { configPath: "/tmp/beta-config" });
  assert.throws(() => parseArgs([]), /BETA_REMINDER_ARGUMENTS_INVALID/);
  assert.throws(() => parseArgs(["--config-path", "./config"]), /BETA_REMINDER_ARGUMENTS_INVALID/);
  assert.throws(() => parseArgs(["--config-path", "/tmp/config", "--sql", "SELECT 1"]),
    /BETA_REMINDER_ARGUMENTS_INVALID/);
});

test("checks beta identity before running only the fixed aggregate query", async (t) => {
  const configPath = await mkdtemp(join(tmpdir(), "hermes-beta-reminder-config-"));
  t.after(() => rm(configPath, { recursive: true, force: true }));
  const client = await fixture(t);
  const calls = [];
  const runCli = async (args) => {
    calls.push(args);
    if (args[0] === "auth") return "esteban-indiveri";
    if (args[1] === "show") return betaShow;
    if (args[1] === "shell") return asTable(await client.execute(SNAPSHOT_SQL));
    throw new Error("unexpected command");
  };
  const result = await observeBetaReimbursementReminder({ configPath, runCli });
  assert.deepEqual(calls.map((args) => args.slice(0, 2)), [
    ["auth", "whoami"], ["db", "show"], ["db", "shell"],
  ]);
  assert.equal(calls[2][3], SNAPSHOT_SQL);
  assert.equal(result.verdict, "eligible_unqueued");
  assert.equal(result.fixture.eligible, true);
  assert.doesNotMatch(JSON.stringify(result), /qa-chat|_UbIZ|504b3827|6a7c238e/);
});

test("fails closed on wrong identity or symlink without querying financial rows", async (t) => {
  const configPath = await mkdtemp(join(tmpdir(), "hermes-beta-reminder-config-"));
  const link = `${configPath}-link`;
  await symlink(configPath, link);
  t.after(() => rm(link));
  t.after(() => rm(configPath, { recursive: true, force: true }));
  for (const [owner, show] of [
    ["eindiveri", betaShow],
    ["esteban-indiveri", betaShow.replace("01a0c0bd-0601-7f27-b147-915d105b19f2", "legacy")],
  ]) {
    const calls = [];
    await assert.rejects(() => observeBetaReimbursementReminder({ configPath,
      runCli: async (args) => { calls.push(args); return args[0] === "auth" ? owner : show; } }),
    /BETA_(IDENTITY|DATABASE)_MISMATCH/);
    assert.equal(calls.some((args) => args[1] === "shell"), false);
  }
  await assert.rejects(() => observeBetaReimbursementReminder({ configPath: link,
    runCli: async () => { throw new Error("must not run"); } }), /BETA_REMINDER_CONFIG_INVALID/);
});

test("classifies strict age, revoked consent, and missing fixture without raw data", async (t) => {
  const client = await fixture(t);
  assert.equal((await observe(client)).verdict, "eligible_unqueued");
  await client.execute({ sql: "UPDATE reimbursement_requests SET created_at=? WHERE id=?",
    args: [Date.now() - 24 * 60 * 60 * 1000, request] });
  assert.equal((await observe(client)).verdict, "awaiting_eligibility");
  await client.execute({ sql: "UPDATE reimbursement_requests SET created_at=? WHERE id=?",
    args: [Date.now() - 4 * 24 * 60 * 60 * 1000, request] });
  await client.execute({ sql: "UPDATE notification_preferences SET reimbursements=0" });
  assert.equal((await observe(client)).fixture.consent, false);
  await client.execute({ sql: "DELETE FROM reimbursement_requests WHERE id=?", args: [request] });
  assert.equal((await observe(client)).verdict, "fixture_missing");
});

test("recognizes one delivery today, avoids false duplicates across days, and flags other recipients", async (t) => {
  const client = await fixture(t);
  await insertReminder(client, { id: "today" });
  let result = await observe(client);
  assert.equal(result.verdict, "sent");
  assert.deepEqual(result.deliveries.todayByStatus,
    { pending: 0, processing: 0, retryable: 0, sent: 1, dead: 0 });
  const yesterday = new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await insertReminder(client, { id: "yesterday", date: yesterday });
  result = await observe(client);
  assert.equal(result.verdict, "sent");
  assert.equal(result.operations.scoped, 2);
  assert.equal(result.operations.today, 1);
  await insertReminder(client, { id: "outside", recipient: requester, chat: "other-chat" });
  assert.equal((await observe(client)).verdict, "scope_violation");
});

test("flags wrong current chat, duplicate same-day send, and malformed CLI output", async (t) => {
  const client = await fixture(t);
  await insertReminder(client, { id: "wrong-chat", chat: "other-chat" });
  assert.equal((await observe(client)).verdict, "scope_violation");
  await client.execute("UPDATE telegram_delivery_outbox SET chat_id='qa-chat'");
  await insertReminder(client, { id: "duplicate" });
  assert.equal((await observe(client)).verdict, "duplicate_today");
  assert.throws(() => parseSnapshotTable("secret-token database failed"), /BETA_REMINDER_OUTPUT_INVALID/);
});
