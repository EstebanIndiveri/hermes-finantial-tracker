import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

const now = Date.parse("2026-10-14T15:00:00Z");
const originalEnv = process.env;
let client: Client;
let directory: string;
let enqueue: typeof import("../reimbursement-reminder-delivery").enqueueReimbursementReminder;
let snapshotHash: typeof import("../reimbursement-reminder-delivery").buildReimbursementReminderSnapshotHash;
let runWorker: typeof import("@/lib/telegram/outbox-worker").runTelegramOutboxWorker;
let claimDelivery: typeof import("@/lib/telegram/outbox").claimTelegramDelivery;

const snapshot = {
  requestId: "request-A", transactionId: "tx-A", payerId: "payer-A",
  requesterId: "requester-A", groupId: "group-A", amount: 100,
  createdAt: now - 4 * 24 * 60 * 60 * 1_000, requesterName: "Requester",
};
const context = { requestId: snapshot.requestId, groupId: snapshot.groupId,
  argentinaDate: "2026-10-14", snapshotHash: "" };
const input = { payerId: "payer-A", chatId: "chat-A", context, message: "Recordatorio QA", now };

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "hermes-reimbursement-reminder-"));
  client = createClient({ url: `file:${join(directory, "db.sqlite")}`, timeout: 0 });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, telegram_user_id TEXT, active_telegram_group_id TEXT);
    CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL);
    CREATE TABLE group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
      joined_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(group_id, user_id));
    CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, daily_summary INTEGER NOT NULL DEFAULT 0,
      recurring INTEGER NOT NULL DEFAULT 0, reimbursements INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, status TEXT NOT NULL,
      deleted_at INTEGER);
    CREATE TABLE splits (id TEXT PRIMARY KEY);
    CREATE TABLE split_payments (id TEXT PRIMARY KEY);
    CREATE TABLE recurring_executions (id TEXT PRIMARY KEY, recurring_expense_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL, status TEXT NOT NULL, amount_ars REAL);
    CREATE TABLE reimbursement_requests (id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL,
      requester_id TEXT NOT NULL, payer_id TEXT, amount REAL NOT NULL, status TEXT NOT NULL,
      created_at INTEGER NOT NULL);
  `);
  await client.executeMultiple(readFileSync(join(process.cwd(), "lib/db/migrations/0010_telegram_operations_outbox.sql"), "utf8"));
  await client.execute({ sql: "INSERT INTO users VALUES (?, ?, ?, ?)", args: ["payer-A", "Payer", "chat-A", "group-A"] });
  await client.execute({ sql: "INSERT INTO users VALUES (?, ?, ?, ?)", args: ["requester-A", "Requester", null, "group-A"] });
  await client.execute({ sql: "INSERT INTO groups VALUES (?, ?, ?)", args: ["group-A", "QA", "requester-A"] });
  await client.execute({ sql: "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)", args: ["group-A", "payer-A", "member"] });
  await client.execute({ sql: "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)", args: ["group-A", "requester-A", "owner"] });
  await client.execute({ sql: "INSERT INTO notification_preferences VALUES (?, 0, 0, 1, 0)", args: ["payer-A"] });
  await client.execute({ sql: "INSERT INTO transactions (id, group_id, status, deleted_at) VALUES (?, ?, ?, ?)", args: ["tx-A", "group-A", "active", null] });
  await client.execute({ sql: "INSERT INTO reimbursement_requests (id, transaction_id, requester_id, payer_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: ["request-A", "tx-A", "requester-A", "payer-A", 100, "pending", snapshot.createdAt] });
  const database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  ({ enqueueReimbursementReminder: enqueue,
    buildReimbursementReminderSnapshotHash: snapshotHash } = await import("../reimbursement-reminder-delivery"));
  context.snapshotHash = snapshotHash(snapshot);
  ({ runTelegramOutboxWorker: runWorker } = await import("@/lib/telegram/outbox-worker"));
  ({ claimTelegramDelivery: claimDelivery } = await import("@/lib/telegram/outbox"));
});

afterAll(() => {
  process.env = originalEnv;
  client.close();
  rmSync(directory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
});

beforeEach(async () => {
  process.env = { ...originalEnv, TELEGRAM_BOT_ID: "beta-bot", NOTIFICATIONS_ENABLED: "true" };
  await client.execute("DELETE FROM telegram_delivery_outbox");
  await client.execute("DELETE FROM telegram_operations");
  await client.execute("UPDATE users SET telegram_user_id='chat-A' WHERE id='payer-A'");
  await client.execute("UPDATE users SET name='Requester' WHERE id='requester-A'");
  await client.execute("UPDATE notification_preferences SET reimbursements=1 WHERE user_id='payer-A'");
  await client.execute("UPDATE reimbursement_requests SET payer_id='payer-A', amount=100, status='pending' WHERE id='request-A'");
  await client.execute("UPDATE transactions SET group_id='group-A', status='active', deleted_at=NULL WHERE id='tx-A'");
  await client.execute("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES ('group-A', 'payer-A', 'member')");
  await client.execute("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES ('group-A', 'requester-A', 'owner')");
});

async function deliver(fetchImpl: typeof fetch, at = now) {
  return runWorker({ botId: process.env.TELEGRAM_BOT_ID ?? "beta-bot", token: "test-token", now: () => at, fetchImpl });
}

function useBetaCanary(groupId = "group-A", payerId = "payer-A") {
  process.env = {
    ...process.env, NOTIFICATIONS_ENABLED: "false", TELEGRAM_BOT_ID: "8739389202",
    HERMES_BETA_ISOLATION_ASSERT: "true",
    NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
    TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
    REIMBURSEMENT_REMINDER_CANARY_ENABLED: "true",
    REIMBURSEMENT_REMINDER_CANARY_PAYER_ID: payerId,
    REIMBURSEMENT_REMINDER_CANARY_GROUP_ID: groupId,
  };
}

it("deduplicates by request, payer and date, then sends only the exact beta canary", async () => {
  useBetaCanary();
  const queued = await Promise.all(Array.from({ length: 4 }, () => enqueue(input)));
  expect(queued.filter(Boolean)).toHaveLength(1);
  const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  expect((await deliver(fetchImpl)).sent).toBe(1);
  expect((await deliver(fetchImpl)).claimed).toBe(0);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([
  ["request paid", "UPDATE reimbursement_requests SET status='paid' WHERE id='request-A'"],
  ["request cancelled", "UPDATE reimbursement_requests SET status='cancelled' WHERE id='request-A'"],
  ["payer reassigned", "UPDATE reimbursement_requests SET payer_id='requester-A' WHERE id='request-A'"],
  ["amount changed", "UPDATE reimbursement_requests SET amount=200 WHERE id='request-A'"],
  ["source deleted", "UPDATE transactions SET deleted_at=1 WHERE id='tx-A'"],
  ["source moved", "UPDATE transactions SET group_id='other-group' WHERE id='tx-A'"],
  ["payer removed", "DELETE FROM group_members WHERE user_id='payer-A'"],
  ["requester removed", "DELETE FROM group_members WHERE user_id='requester-A'"],
  ["chat relinked", "UPDATE users SET telegram_user_id='other-chat' WHERE id='payer-A'"],
  ["consent revoked", "UPDATE notification_preferences SET reimbursements=0 WHERE user_id='payer-A'"],
  ["name changed", "UPDATE users SET name='Other' WHERE id='requester-A'"],
])("drops queued delivery when %s", async (_reason, sql) => {
  await enqueue(input);
  await client.execute(sql);
  const fetchImpl = jest.fn();
  expect((await deliver(fetchImpl)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("drops an out-of-scope, expired or tampered message before Telegram", async () => {
  useBetaCanary();
  await enqueue(input);
  useBetaCanary("other-group");
  const fetchImpl = jest.fn();
  expect((await deliver(fetchImpl)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();

  await client.execute("DELETE FROM telegram_delivery_outbox");
  await client.execute("DELETE FROM telegram_operations");
  useBetaCanary();
  await enqueue(input);
  expect((await deliver(fetchImpl, now + 24 * 60 * 60 * 1_000)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();

  await client.execute("DELETE FROM telegram_delivery_outbox");
  await client.execute("DELETE FROM telegram_operations");
  await enqueue(input);
  await client.execute("UPDATE telegram_delivery_outbox SET text='changed' WHERE status='pending'");
  expect((await deliver(fetchImpl)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("never retries uncertain provider delivery or a recovered lease", async () => {
  await enqueue(input);
  const fetchImpl = jest.fn().mockRejectedValue(new Error("network uncertainty"));
  expect((await deliver(fetchImpl)).dead).toBe(1);
  expect((await deliver(fetchImpl, now + 1_000)).claimed).toBe(0);
  expect(fetchImpl).toHaveBeenCalledTimes(1);

  await client.execute("DELETE FROM telegram_delivery_outbox");
  await client.execute("DELETE FROM telegram_operations");
  await enqueue(input);
  expect((await claimDelivery({ botId: "beta-bot", now, leaseMs: 1_000 }))?.attempt_count).toBe(1);
  expect((await deliver(fetchImpl, now + 1_001)).dead).toBe(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
