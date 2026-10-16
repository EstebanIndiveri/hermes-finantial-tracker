import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import { NextRequest } from "next/server";
import * as schema from "@/lib/db/schema";

let directory: string;
let client: Client;
let POST: typeof import("../route").POST;
const outboxEnvKeys = ["TELEGRAM_INBOX_ENABLED", "TELEGRAM_OUTBOX_ENABLED", "TELEGRAM_OUTBOX_WORKER_ENABLED", "TELEGRAM_BOT_ID", "TELEGRAM_BOT_TOKEN"] as const;
const originalOutboxEnv = Object.fromEntries(outboxEnvKeys.map((key) => [key, process.env[key]]));

function enableOutbox() {
  process.env.TELEGRAM_INBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_ENABLED = "true";
  process.env.TELEGRAM_OUTBOX_WORKER_ENABLED = "true";
  process.env.TELEGRAM_BOT_ID = "beta-bot";
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
}

function restoreOutboxEnv() {
  for (const key of outboxEnvKeys) {
    const original = originalOutboxEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

const operationId = "809f0a91-1b3a-48fd-91be-210c29ed75ae";
const validBody = {
  operationId,
  payerUserId: "guest",
  payeeUserId: "owner",
  amount: 5,
  method: "manual",
};

async function post(body: unknown, userId = "guest") {
  const request = new NextRequest("http://localhost/api/splits/sessions/session-a/payments", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": userId },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id: "session-a" }) });
}

async function paymentCount(): Promise<number> {
  const result = await client.execute("SELECT count(*) AS count FROM split_payments");
  return Number(result.rows[0].count);
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "hermes-session-payment-"));
  client = createClient({ url: `file:${join(directory, "db.sqlite")}`, timeout: 0 });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL,
      telegram_user_id TEXT, personal_token_hash TEXT, active_telegram_group_id TEXT,
      onboarding_completed_at INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE temp_users (id TEXT PRIMARY KEY);
    CREATE TABLE split_sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL, telegram_chat_id TEXT, status TEXT NOT NULL,
      last_alert_at INTEGER, created_at INTEGER NOT NULL, closed_at INTEGER, closing_note TEXT);
    CREATE TABLE split_session_members (session_id TEXT NOT NULL, user_id TEXT,
      temp_user_id TEXT, joined_at INTEGER NOT NULL);
    CREATE TABLE splits (id TEXT PRIMARY KEY, operation_id TEXT, session_id TEXT NOT NULL,
      description TEXT NOT NULL, total_amount REAL NOT NULL, split_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', created_by_user_id TEXT,
      created_by_temp_id TEXT, created_at INTEGER NOT NULL, cancelled_at INTEGER,
      telegram_message_id TEXT);
    CREATE TABLE split_payers (id TEXT PRIMARY KEY, split_id TEXT NOT NULL,
      user_id TEXT, temp_user_id TEXT, amount_paid REAL NOT NULL);
    CREATE TABLE split_items (id TEXT PRIMARY KEY, split_id TEXT NOT NULL,
      user_id TEXT, temp_user_id TEXT, amount_owed REAL NOT NULL, percentage REAL);
    CREATE TABLE split_payments (id TEXT PRIMARY KEY, operation_id TEXT,
      session_id TEXT NOT NULL, payer_user_id TEXT, payer_temp_id TEXT,
      payee_user_id TEXT, payee_temp_id TEXT, amount REAL NOT NULL,
      method TEXT NOT NULL, receipt_image_url TEXT, ocr_raw_text TEXT,
      confirmed_at INTEGER, telegram_update_id TEXT);
    CREATE UNIQUE INDEX split_payments_operation_id_idx ON split_payments(operation_id)
      WHERE operation_id IS NOT NULL;
    CREATE TABLE telegram_operations (operation_id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, update_id TEXT NOT NULL,
      operation_kind TEXT NOT NULL, status TEXT NOT NULL, resource_type TEXT, resource_id TEXT,
      result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, committed_at INTEGER);
    CREATE UNIQUE INDEX telegram_operations_namespace_idx ON telegram_operations(operation_id, bot_id, update_id);
    CREATE TABLE telegram_delivery_outbox (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, update_id TEXT NOT NULL,
      operation_id TEXT NOT NULL, delivery_key TEXT NOT NULL, action TEXT NOT NULL, chat_id TEXT NOT NULL,
      message_id INTEGER, parse_mode TEXT NOT NULL, text TEXT NOT NULL, reply_markup_json TEXT,
      status TEXT NOT NULL, attempt_count INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL,
      lease_token TEXT, lease_expires_at INTEGER, provider_message_id TEXT, last_error_code TEXT,
      last_http_status INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      sent_at INTEGER, retention_until INTEGER,
      FOREIGN KEY(operation_id,bot_id,update_id) REFERENCES telegram_operations(operation_id,bot_id,update_id));
    CREATE UNIQUE INDEX telegram_delivery_outbox_delivery_key_idx ON telegram_delivery_outbox(bot_id, delivery_key);
    INSERT INTO users (id,name,username,created_at) VALUES
      ('owner','Owner','',1), ('guest','Guest','',1), ('outsider','Outsider','',1);
    INSERT INTO temp_users VALUES ('temp-a');
    INSERT INTO split_sessions (id, name, owner_user_id, status, created_at)
      VALUES ('session-a', 'QA', 'owner', 'open', 1);
    INSERT INTO split_session_members VALUES ('session-a', 'owner', NULL, 1),
      ('session-a', 'guest', NULL, 1), ('session-a', NULL, 'temp-a', 1);
    INSERT INTO splits (id, session_id, description, total_amount, split_type,
      status, created_by_user_id, created_at) VALUES
      ('split-a', 'session-a', 'QA', 20, 'equal', 'active', 'owner', 1);
    INSERT INTO split_payers VALUES ('payer-a', 'split-a', 'owner', NULL, 20);
    INSERT INTO split_items VALUES ('item-owner', 'split-a', 'owner', NULL, 10, NULL),
      ('item-guest', 'split-a', 'guest', NULL, 10, NULL);
  `);
  const database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  ({ POST } = await import("../route"));
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
  restoreOutboxEnv();
});

beforeEach(async () => {
  await client.execute("DELETE FROM telegram_delivery_outbox");
  await client.execute("DELETE FROM telegram_operations");
  await client.execute("DELETE FROM split_payments");
  await client.execute("UPDATE users SET telegram_user_id = NULL");
  await client.execute("UPDATE split_sessions SET status = 'open' WHERE id = 'session-a'");
  await client.execute("DROP TRIGGER IF EXISTS reject_payment");
  restoreOutboxEnv();
});

afterEach(restoreOutboxEnv);

it("queues one creditor notice atomically with the session payment and none on replay", async () => {
  enableOutbox();
  await client.execute("UPDATE users SET telegram_user_id = 'chat-owner' WHERE id = 'owner'");
  const first = await post(validBody);
  expect(first.status).toBe(201);
  await expect(first.json()).resolves.toMatchObject({ notificationQueued: true });
  const replay = await post(validBody);
  expect(replay.status).toBe(200);
  await expect(replay.json()).resolves.toMatchObject({ notificationQueued: null });
  const rows = await client.execute(`SELECT p.id, o.operation_kind, d.chat_id, d.status
    FROM split_payments p JOIN telegram_operations o ON o.resource_id = p.id
    JOIN telegram_delivery_outbox d ON d.operation_id = o.operation_id`);
  expect(rows.rows).toHaveLength(1);
  expect(rows.rows[0]).toMatchObject({
    operation_kind: "web.split.payment", chat_id: "chat-owner", status: "pending",
  });
});

it("rolls back the session payment if its durable notice cannot be inserted", async () => {
  enableOutbox();
  await client.execute("UPDATE users SET telegram_user_id = 'chat-owner' WHERE id = 'owner'");
  await client.execute("CREATE TRIGGER reject_session_notice BEFORE INSERT ON telegram_delivery_outbox BEGIN SELECT RAISE(ABORT, 'delivery rejected'); END");
  try {
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try { expect((await post(validBody)).status).toBe(500); } finally { log.mockRestore(); }
    const counts = await client.execute(`SELECT
      (SELECT COUNT(*) FROM split_payments) AS payments,
      (SELECT COUNT(*) FROM telegram_operations) AS operations,
      (SELECT COUNT(*) FROM telegram_delivery_outbox) AS deliveries`);
    expect(counts.rows[0]).toMatchObject({ payments: 0, operations: 0, deliveries: 0 });
  } finally {
    await client.execute("DROP TRIGGER reject_session_notice");
  }
});

it("records without a Telegram intent when the creditor has no linked chat", async () => {
  enableOutbox();
  const response = await post(validBody);
  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({ notificationQueued: false });
  const counts = await client.execute(`SELECT
    (SELECT COUNT(*) FROM split_payments) AS payments,
    (SELECT COUNT(*) FROM telegram_operations) AS operations,
    (SELECT COUNT(*) FROM telegram_delivery_outbox) AS deliveries`);
  expect(counts.rows[0]).toMatchObject({ payments: 1, operations: 0, deliveries: 0 });
});

it("keeps the former no-notice behavior when the outbox is disabled", async () => {
  await client.execute("UPDATE users SET telegram_user_id = 'chat-owner' WHERE id = 'owner'");
  const response = await post(validBody);
  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({ notificationQueued: false });
  const counts = await client.execute(`SELECT
    (SELECT COUNT(*) FROM split_payments) AS payments,
    (SELECT COUNT(*) FROM telegram_operations) AS operations`);
  expect(counts.rows[0]).toMatchObject({ payments: 1, operations: 0 });
});

it("records an authorized payment once", async () => {
  const response = await post(validBody);
  expect(response.status).toBe(201);
  expect(await paymentCount()).toBe(1);
  const rows = await client.execute("SELECT payer_user_id, payee_user_id, amount, operation_id FROM split_payments");
  expect(rows.rows[0]).toMatchObject({ payer_user_id: "guest", payee_user_id: "owner", amount: 5, operation_id: operationId });
});

it("rejects a member's attempt to record a third party's payment", async () => {
  const response = await post(validBody, "owner");
  expect(response.status).toBe(403);
  expect(await paymentCount()).toBe(0);
});

it("rejects overpayment, self-payment, nonmember creditor and sub-cent amounts", async () => {
  expect((await post({ ...validBody, amount: 11 })).status).toBe(400);
  expect((await post({ ...validBody, payeeUserId: "guest" })).status).toBe(400);
  expect((await post({ ...validBody, payeeUserId: "outsider" })).status).toBe(400);
  expect((await post({ ...validBody, amount: 0.001 })).status).toBe(400);
  expect((await post({ ...validBody, payeeTempId: "temp-a" })).status).toBe(400);
  expect((await post({ ...validBody, payerTempId: "temp-a" })).status).toBe(400);
  expect(await paymentCount()).toBe(0);
});

it("rejects an ex-member before revealing or writing a payment", async () => {
  await client.execute("DELETE FROM split_session_members WHERE session_id = 'session-a' AND user_id = 'guest'");
  try {
    expect((await post(validBody)).status).toBe(403);
    expect(await paymentCount()).toBe(0);
  } finally {
    await client.execute("INSERT INTO split_session_members VALUES ('session-a', 'guest', NULL, 1)");
  }
});

it("rejects unconfirmed OCR payments and missing operation keys", async () => {
  expect((await post({ ...validBody, method: "receipt_ocr" })).status).toBe(400);
  const withoutKey = { payerUserId: "guest", payeeUserId: "owner", amount: 5, method: "manual" };
  expect((await post(withoutKey)).status).toBe(400);
  expect(await paymentCount()).toBe(0);
});

it("does not treat a pending OCR row as a confirmed settlement", async () => {
  await client.execute({
    sql: `INSERT INTO split_payments (id, session_id, payer_user_id, payee_user_id,
      amount, method, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    args: ["ocr-pending", "session-a", "guest", "owner", 10, "receipt_ocr"],
  });
  expect((await post({ ...validBody, amount: 10 })).status).toBe(201);
  expect(await paymentCount()).toBe(2);
});

it("applies earlier confirmed payments before accepting another intention", async () => {
  expect((await post({ ...validBody, amount: 6 })).status).toBe(201);
  const second = await post({ ...validBody, operationId: "baf28be3-c8a4-4230-8e2a-2209a884b6da", amount: 5 });
  expect(second.status).toBe(400);
  expect(await paymentCount()).toBe(1);
});

it("replays an identical payment after session close and rejects changed payload", async () => {
  const first = await post(validBody);
  expect(first.status).toBe(201);
  const firstBody = await first.json();
  await client.execute("UPDATE split_sessions SET status = 'closed' WHERE id = 'session-a'");
  const replay = await post(validBody);
  expect(replay.status).toBe(200);
  expect((await replay.json()).id).toBe(firstBody.id);
  expect((await post({ ...validBody, amount: 6 })).status).toBe(409);
  expect(await paymentCount()).toBe(1);
});

it("rolls back when the insert fails", async () => {
  await client.execute(`CREATE TRIGGER reject_payment BEFORE INSERT ON split_payments
    BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END`);
  const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
  expect((await post(validBody)).status).toBe(500);
  expect(await paymentCount()).toBe(0);
  log.mockRestore();
});
