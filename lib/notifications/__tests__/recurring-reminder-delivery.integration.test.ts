import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

const now = Date.parse("2026-10-14T12:00:00Z");
const context = {
  groupId: "group-A",
  argentinaDate: "2026-10-14",
  reminderKind: "upcoming" as const,
  executionIds: ["exec-A"],
  snapshotHash: "",
};
const input = { userId: "user-A", chatId: "chat-A", context, message: "Recordatorio QA", now };
const originalEnv = process.env;
let client: Client;
let directory: string;
let enqueue: typeof import("../recurring-reminder-delivery").enqueueRecurringReminder;
let runWorker: typeof import("@/lib/telegram/outbox-worker").runTelegramOutboxWorker;
let claimDelivery: typeof import("@/lib/telegram/outbox").claimTelegramDelivery;
let buildSnapshot: typeof import("../recurring-reminder-delivery").buildRecurringReminderSnapshotHash;

function snapshotItem(scheduledDate = "2026-10-17") {
  return { id: "exec-A", scheduledDate, amountArs: null, recurringName: "Internet",
    recurringAmount: 100, categoryEmoji: null };
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "hermes-recurring-reminder-"));
  client = createClient({ url: `file:${join(directory, "db.sqlite")}`, timeout: 0 });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, telegram_user_id TEXT, active_telegram_group_id TEXT);
    CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL);
    CREATE TABLE group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
      joined_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(group_id, user_id));
    CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, daily_summary INTEGER NOT NULL DEFAULT 0,
      recurring INTEGER NOT NULL DEFAULT 0, reimbursements INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE transactions (id TEXT PRIMARY KEY);
    CREATE TABLE splits (id TEXT PRIMARY KEY);
    CREATE TABLE split_payments (id TEXT PRIMARY KEY);
    CREATE TABLE reimbursement_requests (id TEXT PRIMARY KEY);
    CREATE TABLE categories (id TEXT PRIMARY KEY, emoji TEXT NOT NULL);
    CREATE TABLE recurring_expenses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_id TEXT NOT NULL,
      name TEXT NOT NULL, amount_ars REAL NOT NULL, category_id TEXT);
    CREATE TABLE recurring_executions (id TEXT PRIMARY KEY, recurring_expense_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL, status TEXT NOT NULL, amount_ars REAL);
  `);
  await client.executeMultiple(readFileSync(join(process.cwd(), "lib/db/migrations/0010_telegram_operations_outbox.sql"), "utf8"));
  await client.execute({ sql: "INSERT INTO users VALUES (?, ?, ?)", args: ["user-A", "chat-A", "group-A"] });
  await client.execute({ sql: "INSERT INTO users VALUES (?, ?, ?)", args: ["user-B", "chat-B", "group-A"] });
  await client.execute({ sql: "INSERT INTO groups VALUES (?, ?, ?)", args: ["group-A", "QA", "user-A"] });
  await client.execute({ sql: "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)", args: ["group-A", "user-A", "owner"] });
  await client.execute({ sql: "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)", args: ["group-A", "user-B", "member"] });
  await client.execute({ sql: "INSERT INTO notification_preferences VALUES (?, 0, 1, 0, 0)", args: ["user-A"] });
  await client.execute({ sql: "INSERT INTO notification_preferences VALUES (?, 0, 1, 0, 0)", args: ["user-B"] });
  await client.execute({ sql: "INSERT INTO recurring_expenses VALUES (?, ?, ?, ?, ?, ?)", args: ["rec-A", "user-A", "group-A", "Internet", 100, null] });
  await client.execute({ sql: "INSERT INTO recurring_expenses VALUES (?, ?, ?, ?, ?, ?)", args: ["rec-B", "user-B", "group-A", "Internet B", 200, null] });
  await client.execute({ sql: "INSERT INTO recurring_executions VALUES (?, ?, ?, ?, ?)", args: ["exec-A", "rec-A", "2026-10-17", "pending", null] });
  await client.execute({ sql: "INSERT INTO recurring_executions VALUES (?, ?, ?, ?, ?)", args: ["exec-B", "rec-B", "2026-10-17", "pending", null] });
  const database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  ({ enqueueRecurringReminder: enqueue, buildRecurringReminderSnapshotHash: buildSnapshot } = await import("../recurring-reminder-delivery"));
  context.snapshotHash = buildSnapshot([snapshotItem()]);
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
  await client.execute("UPDATE users SET telegram_user_id='chat-A', active_telegram_group_id='group-A' WHERE id='user-A'");
  await client.execute("UPDATE users SET telegram_user_id='chat-B', active_telegram_group_id='group-A' WHERE id='user-B'");
  await client.execute("UPDATE notification_preferences SET recurring=1 WHERE user_id='user-A'");
  await client.execute("UPDATE notification_preferences SET recurring=1 WHERE user_id='user-B'");
  await client.execute("UPDATE recurring_executions SET status='pending', scheduled_date='2026-10-17' WHERE id='exec-A'");
  await client.execute("UPDATE recurring_executions SET status='pending', scheduled_date='2026-10-17' WHERE id='exec-B'");
  await client.execute("UPDATE recurring_expenses SET name='Internet', amount_ars=100 WHERE id='rec-A'");
  await client.execute("UPDATE recurring_expenses SET name='Internet B', amount_ars=200 WHERE id='rec-B'");
  await client.execute("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES ('group-A', 'user-A', 'owner')");
  await client.execute("INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES ('group-A', 'user-B', 'member')");
});

async function deliver(fetchImpl: typeof fetch, at = now) {
  return runWorker({ botId: process.env.TELEGRAM_BOT_ID ?? "beta-bot", token: "test-token", now: () => at, fetchImpl });
}

function useBetaCanary(groupId = "group-A") {
  process.env = {
    ...process.env,
    NOTIFICATIONS_ENABLED: "false",
    TELEGRAM_BOT_ID: "8739389202",
    HERMES_BETA_ISOLATION_ASSERT: "true",
    NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
    TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
    RECURRING_REMINDER_CANARY_ENABLED: "true",
    RECURRING_REMINDER_CANARY_USER_ID: "user-A",
    RECURRING_REMINDER_CANARY_GROUP_ID: groupId,
  };
}

it("sends only the beta canary recipient and still rechecks the scope at dispatch", async () => {
  useBetaCanary();
  expect(await enqueue(input)).toBe(true);
  const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  expect((await deliver(fetchImpl)).sent).toBe(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);

  await client.execute("DELETE FROM telegram_delivery_outbox");
  await client.execute("DELETE FROM telegram_operations");
  expect(await enqueue(input)).toBe(true);
  useBetaCanary("group-B");
  const rejectedFetch = jest.fn();
  expect((await deliver(rejectedFetch)).dead).toBe(1);
  expect(rejectedFetch).not.toHaveBeenCalled();
});

it("never sends a queued reminder to another member of the canary group", async () => {
  useBetaCanary();
  const otherUser = {
    ...input,
    userId: "user-B",
    chatId: "chat-B",
    context: {
      ...context,
      executionIds: ["exec-B"],
      snapshotHash: buildSnapshot([{
        id: "exec-B", scheduledDate: "2026-10-17", amountArs: null,
        recurringName: "Internet B", recurringAmount: 200, categoryEmoji: null,
      }]),
    },
  };
  expect(await enqueue(otherUser)).toBe(true);
  const fetchImpl = jest.fn();
  expect((await deliver(fetchImpl)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
  const rows = await client.execute("SELECT chat_id, status FROM telegram_delivery_outbox");
  expect(rows.rows).toEqual([{ chat_id: "chat-B", status: "dead" }]);
});

it("deduplicates concurrent cron intents and delivers only once", async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => enqueue(input)));
  expect(results.filter(Boolean)).toHaveLength(1);
  const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  expect((await deliver(fetchImpl)).sent).toBe(1);
  expect((await deliver(fetchImpl)).claimed).toBe(0);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("never pairs one cron snapshot's context with another snapshot's message", async () => {
  expect(await enqueue(input)).toBe(true);
  await client.execute("DELETE FROM telegram_delivery_outbox");
  const changedSnapshot = {
    ...input,
    context: { ...context, executionIds: ["exec-B"] },
    message: "Recordatorio con otro cargo",
  };
  expect(await enqueue(changedSnapshot)).toBe(false);
  expect(await enqueue({ ...input, message: "El mismo cargo con otro texto" })).toBe(false);
  expect(await enqueue(input)).toBe(true);
  const stored = await client.execute("SELECT text FROM telegram_delivery_outbox");
  expect(stored.rows).toEqual([{ text: "Recordatorio QA" }]);
});

it("rejects an outbox text that no longer matches its stored operation", async () => {
  await enqueue(input);
  await client.execute("UPDATE telegram_delivery_outbox SET text='Otro cargo' WHERE status='pending'");
  const fetchImpl = jest.fn();
  expect((await deliver(fetchImpl)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("delivers an overdue reminder only while its execution remains pending", async () => {
  await client.execute("UPDATE recurring_executions SET scheduled_date='2026-10-13' WHERE id='exec-A'");
  const overdue = { ...input, context: { ...context, reminderKind: "overdue" as const,
    snapshotHash: buildSnapshot([snapshotItem("2026-10-13")]) } };
  expect(await enqueue(overdue)).toBe(true);
  const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  expect((await deliver(fetchImpl)).sent).toBe(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([
  ["consent revoked", "UPDATE notification_preferences SET recurring=0 WHERE user_id='user-A'"],
  ["chat relinked", "UPDATE users SET telegram_user_id='chat-B' WHERE id='user-A'"],
  ["group switched", "UPDATE users SET active_telegram_group_id='group-B' WHERE id='user-A'"],
  ["membership removed", "DELETE FROM group_members WHERE group_id='group-A' AND user_id='user-A'"],
  ["execution paid", "UPDATE recurring_executions SET status='confirmed' WHERE id='exec-A'"],
  ["amount edited", "UPDATE recurring_expenses SET amount_ars=200 WHERE id='rec-A'"],
  ["name edited", "UPDATE recurring_expenses SET name='Internet nuevo' WHERE id='rec-A'"],
])("drops a queued reminder when %s", async (_reason, sql) => {
  await enqueue(input);
  await client.execute(sql);
  const fetchImpl = jest.fn();
  expect((await deliver(fetchImpl)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("drops a queued reminder when the broad switch is disabled", async () => {
  await enqueue(input);
  process.env.NOTIFICATIONS_ENABLED = "false";
  const fetchImpl = jest.fn();
  expect((await deliver(fetchImpl)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("fails closed if the broad switch is missing or malformed", async () => {
  await enqueue(input);
  delete process.env.NOTIFICATIONS_ENABLED;
  const fetchImpl = jest.fn();
  expect((await deliver(fetchImpl)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("drops a reminder after its Argentina calendar day", async () => {
  await enqueue(input);
  const fetchImpl = jest.fn();
  expect((await deliver(fetchImpl, now + 24 * 60 * 60 * 1_000)).dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not retry an uncertain provider response or a recovered lease", async () => {
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
