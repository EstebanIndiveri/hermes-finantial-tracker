import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

let client: Client;
let directory: string;
let enqueueDailySummary: typeof import("../daily-summary-delivery").enqueueDailySummary;
let buildDailySummaryIdentity: typeof import("../daily-summary-delivery").buildDailySummaryIdentity;
let runWorker: typeof import("@/lib/telegram/outbox-worker").runTelegramOutboxWorker;
let claimDelivery: typeof import("@/lib/telegram/outbox").claimTelegramDelivery;
const originalEnv = process.env;

const base = { userId: "user-A", groupId: "group-A", chatId: "chat-A", message: "Resumen QA" };

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "hermes-daily-summary-"));
  client = createClient({ url: `file:${join(directory, "db.sqlite")}`, timeout: 0 });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, telegram_user_id TEXT, active_telegram_group_id TEXT);
    CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL);
    CREATE TABLE group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, joined_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE notification_preferences (user_id TEXT PRIMARY KEY, daily_summary INTEGER NOT NULL DEFAULT 0,
      recurring INTEGER NOT NULL DEFAULT 0, reimbursements INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE transactions (id TEXT PRIMARY KEY);
    CREATE TABLE splits (id TEXT PRIMARY KEY);
    CREATE TABLE split_payments (id TEXT PRIMARY KEY);
    CREATE TABLE reimbursement_requests (id TEXT PRIMARY KEY);
    CREATE TABLE recurring_executions (id TEXT PRIMARY KEY, recurring_expense_id TEXT NOT NULL, scheduled_date TEXT NOT NULL);
  `);
  await client.executeMultiple(readFileSync(join(process.cwd(), "lib/db/migrations/0010_telegram_operations_outbox.sql"), "utf8"));
  await client.execute({ sql: "INSERT INTO users VALUES (?, ?, ?)", args: ["user-A", "chat-A", "group-A"] });
  await client.execute({ sql: "INSERT INTO groups VALUES (?, ?, ?)", args: ["group-A", "QA", "user-A"] });
  await client.execute({ sql: "INSERT INTO groups VALUES (?, ?, ?)", args: ["group-B", "QA other", "user-A"] });
  await client.execute({ sql: "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)", args: ["group-A", "user-A", "owner"] });
  await client.execute({ sql: "INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)", args: ["group-B", "user-A", "owner"] });
  await client.execute({ sql: "INSERT INTO notification_preferences VALUES (?, 1, 0, 0, 0)", args: ["user-A"] });
  const database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  ({ enqueueDailySummary, buildDailySummaryIdentity } = await import("../daily-summary-delivery"));
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
  await client.execute("UPDATE notification_preferences SET daily_summary=1 WHERE user_id='user-A'");
  await client.execute("UPDATE users SET telegram_user_id='chat-A', active_telegram_group_id='group-A' WHERE id='user-A'");
});

it("deduplicates repeated and concurrent cron intents and sends once", async () => {
  const input = { ...base, argentinaDate: "2026-10-13", now: 1_000 };
  const results = await Promise.all(Array.from({ length: 5 }, () => enqueueDailySummary(input)));
  expect(results.filter(Boolean)).toHaveLength(1);
  const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }));
  const first = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 1_000, fetchImpl });
  const second = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 1_000, fetchImpl });
  expect(first.sent).toBe(1);
  expect(second.claimed).toBe(0);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("repairs an interrupted parent insert but never recreates a purged delivery", async () => {
  const date = "2026-10-21";
  const identity = buildDailySummaryIdentity("beta-bot", "user-A", date);
  await client.execute({
    sql: `INSERT INTO telegram_operations
      (operation_id, bot_id, update_id, operation_kind, status, resource_type, resource_id, result_json, created_at, updated_at)
      VALUES (?, ?, ?, 'proactive.daily_summary', 'committed', 'daily_summary', ?, ?, 8000, 8000)`,
    args: [identity.operationId, "beta-bot", identity.updateId, "user-A", JSON.stringify({ groupId: "group-A" })],
  });
  expect(await enqueueDailySummary({ ...base, argentinaDate: date, now: 8_100 })).toBe(true);
  expect(await enqueueDailySummary({ ...base, argentinaDate: date, now: 8_200 })).toBe(false);
  await client.execute({ sql: "DELETE FROM telegram_delivery_outbox WHERE delivery_key=?", args: [identity.deliveryKey] });
  expect(await enqueueDailySummary({
    ...base, argentinaDate: date, now: 8_000 + 30 * 24 * 60 * 60 * 1_000 + 1,
  })).toBe(false);
});

it("does not send after consent is revoked", async () => {
  await enqueueDailySummary({ ...base, argentinaDate: "2026-10-14", now: 2_000 });
  await client.execute("UPDATE notification_preferences SET daily_summary=0 WHERE user_id='user-A'");
  const fetchImpl = jest.fn();
  const result = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 2_000, fetchImpl });
  expect(result.dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not send to a relinked private chat", async () => {
  await enqueueDailySummary({ ...base, argentinaDate: "2026-10-15", now: 3_000 });
  await client.execute("UPDATE users SET telegram_user_id='chat-B' WHERE id='user-A'");
  const fetchImpl = jest.fn();
  const result = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 3_000, fetchImpl });
  expect(result.dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not send after the active group changes", async () => {
  await enqueueDailySummary({ ...base, argentinaDate: "2026-10-18", now: 3_500 });
  await client.execute("UPDATE users SET active_telegram_group_id='group-B' WHERE id='user-A'");
  const fetchImpl = jest.fn();
  const result = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 3_500, fetchImpl });
  expect(result.dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not send if the global proactive switch is turned off after queueing", async () => {
  await enqueueDailySummary({ ...base, argentinaDate: "2026-10-19", now: 3_600 });
  process.env.NOTIFICATIONS_ENABLED = "false";
  const fetchImpl = jest.fn();
  const result = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 3_600, fetchImpl });
  expect(result.dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not send if the proactive flag disappears after queueing", async () => {
  await enqueueDailySummary({ ...base, argentinaDate: "2026-10-20", now: 3_700 });
  delete process.env.NOTIFICATIONS_ENABLED;
  const fetchImpl = jest.fn();
  const result = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 3_700, fetchImpl });
  expect(result.dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not retry an uncertain send after a recovered lease", async () => {
  await enqueueDailySummary({ ...base, argentinaDate: "2026-10-16", now: 4_000 });
  const claimed = await claimDelivery({ botId: "beta-bot", now: 4_000, leaseMs: 1_000 });
  expect(claimed?.attempt_count).toBe(1);
  const fetchImpl = jest.fn();
  const result = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 5_001, fetchImpl });
  expect(result.dead).toBe(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not retry a network-uncertain provider result", async () => {
  await enqueueDailySummary({ ...base, argentinaDate: "2026-10-17", now: 6_000 });
  const fetchImpl = jest.fn().mockRejectedValue(new Error("network failure"));
  const first = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 6_000, fetchImpl });
  const second = await runWorker({ botId: "beta-bot", token: "test-token", now: () => 7_000, fetchImpl });
  expect(first.dead).toBe(1);
  expect(second.claimed).toBe(0);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const dead = await client.execute("SELECT COUNT(*) AS count FROM telegram_delivery_outbox WHERE last_error_code='delivery_uncertain'");
  expect(Number(dead.rows[0].count)).toBeGreaterThan(0);
});
