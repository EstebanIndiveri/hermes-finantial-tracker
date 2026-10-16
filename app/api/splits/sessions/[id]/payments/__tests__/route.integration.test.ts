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
    CREATE TABLE users (id TEXT PRIMARY KEY);
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
    INSERT INTO users VALUES ('owner'), ('guest'), ('outsider');
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
});

beforeEach(async () => {
  await client.execute("DELETE FROM split_payments");
  await client.execute("UPDATE split_sessions SET status = 'open' WHERE id = 'session-a'");
  await client.execute("DROP TRIGGER IF EXISTS reject_payment");
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
