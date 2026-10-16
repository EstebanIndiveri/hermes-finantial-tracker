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
const notifySplitPaymentReceived = jest.fn().mockResolvedValue(undefined);

function request(operationId: string, amount: number, payeeUserId = "owner") {
  return new NextRequest("http://localhost/api/splits/payments", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "hermes_session=qa" },
    body: JSON.stringify({ operationId, sessionId: "session-a", payeeUserId, amount }),
  });
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "hermes-web-payment-race-"));
  client = createClient({ url: `file:${join(directory, "db.sqlite")}`, timeout: 0 });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL,
      telegram_user_id TEXT, personal_token_hash TEXT, active_telegram_group_id TEXT,
      onboarding_completed_at INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE temp_users (id TEXT PRIMARY KEY, first_name TEXT);
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
    INSERT INTO users (id,name,username,created_at) VALUES
      ('owner','Owner','',1), ('guest','Guest','',1), ('outsider','Outsider','',1);
    INSERT INTO split_sessions (id,name,owner_user_id,status,created_at)
      VALUES ('session-a','QA','owner','open',1);
    INSERT INTO split_session_members VALUES ('session-a','owner',NULL,1),
      ('session-a','guest',NULL,1);
    INSERT INTO splits (id,session_id,description,total_amount,split_type,status,created_by_user_id,created_at)
      VALUES ('split-a','session-a','QA',20,'equal','active','owner',1);
    INSERT INTO split_payers VALUES ('payer-a','split-a','owner',NULL,20);
    INSERT INTO split_items VALUES ('item-owner','split-a','owner',NULL,10,NULL),
      ('item-guest','split-a','guest',NULL,10,NULL);
  `);
  const database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  jest.doMock("@/lib/auth/session", () => ({ verifySession: jest.fn().mockResolvedValue("guest") }));
  jest.doMock("@/lib/auth/session-cookie", () => ({ getSessionCookieName: () => "hermes_session" }));
  // Simulate two requests that both observed the same stale debt projection.
  jest.doMock("@/lib/splits/global-balances", () => ({
    calculateGlobalBalances: jest.fn().mockResolvedValue({
      youOwe: [{ from: { userId: "guest" }, to: { userId: "owner" }, amount: 10, sessionIds: ["session-a"] }],
      partnerBalances: [{ partner: { userId: "owner" }, net: -10,
        sessionBreakdown: [{ sessionId: "session-a", sessionName: "QA", net: -10 }] }],
    }),
  }));
  jest.doMock("@/lib/notifications/telegram", () => ({ notifySplitPaymentReceived }));
  ({ POST } = await import("../route"));
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
  jest.dontMock("@/lib/auth/session");
  jest.dontMock("@/lib/auth/session-cookie");
  jest.dontMock("@/lib/splits/global-balances");
  jest.dontMock("@/lib/notifications/telegram");
});

beforeEach(async () => {
  await client.execute("DELETE FROM split_payments");
  notifySplitPaymentReceived.mockClear();
});

it("rejects a second operation that exceeds debt despite a stale projection", async () => {
  const first = await POST(request("1f45fca4-737d-4960-9147-98c193bf722a", 6));
  const second = await POST(request("785786d3-6845-4adc-985c-c223319b9e31", 6));
  expect(first.status).toBe(200);
  expect(second.status).toBe(400);
  const rows = await client.execute("SELECT amount FROM split_payments");
  expect(rows.rows).toHaveLength(1);
  expect(notifySplitPaymentReceived).toHaveBeenCalledTimes(1);
});

it("rejects a Telegram payment against the same debt after a web payment", async () => {
  const first = await POST(request("4c58e4bf-47c4-4693-89dc-d3be3f8fbdf0", 6));
  expect(first.status).toBe(200);
  const { db } = await import("@/lib/db/client");
  const { recordManualSplitPaymentInTransaction } = await import("@/lib/splits/record-payment");
  const second = await db.transaction((tx) => recordManualSplitPaymentInTransaction(tx, {
    operationId: "tgop_v1_telegram-qa",
    sessionId: "session-a",
    actorId: "guest",
    payeeUserId: "owner",
    amount: 6,
  }));
  expect(second).toEqual(expect.objectContaining({ status: 400 }));
  const rows = await client.execute("SELECT id FROM split_payments");
  expect(rows.rows).toHaveLength(1);
});

it("records a temporary Telegram debtor once and uses the committed remaining balance", async () => {
  await client.executeMultiple(`
    INSERT INTO temp_users (id,first_name) VALUES ('temp-debtor','QA Temp');
    INSERT INTO split_session_members VALUES ('session-a',NULL,'temp-debtor',1);
    INSERT INTO splits (id,session_id,description,total_amount,split_type,status,created_by_user_id,created_at)
      VALUES ('split-temp','session-a','Temp QA',10,'equal','active','owner',1);
    INSERT INTO split_payers VALUES ('payer-temp','split-temp','owner',NULL,10);
    INSERT INTO split_items VALUES ('item-temp','split-temp',NULL,'temp-debtor',10,NULL);
  `);
  try {
    const { db } = await import("@/lib/db/client");
    const { recordManualSplitPaymentInTransaction } = await import("@/lib/splits/record-payment");
    const input = {
      operationId: "tgop_v1_temp-qa", sessionId: "session-a", actorTempId: "temp-debtor",
      payeeUserId: "owner", amount: 4,
    };
    const first = await db.transaction((tx) => recordManualSplitPaymentInTransaction(tx, input));
    expect(first).toEqual(expect.objectContaining({ replayed: false, remainingDebt: 6 }));
    const replay = await db.transaction((tx) => recordManualSplitPaymentInTransaction(tx, input));
    expect(replay).toEqual(expect.objectContaining({ replayed: true }));
    const rows = await client.execute("SELECT payer_user_id,payer_temp_id,amount FROM split_payments");
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toEqual(expect.objectContaining({ payer_user_id: null, payer_temp_id: "temp-debtor", amount: 4 }));
  } finally {
    await client.execute("DELETE FROM split_payments WHERE session_id = 'session-a'");
    await client.execute("DELETE FROM split_items WHERE split_id = 'split-temp'");
    await client.execute("DELETE FROM split_payers WHERE split_id = 'split-temp'");
    await client.execute("DELETE FROM splits WHERE id = 'split-temp'");
    await client.execute("DELETE FROM split_session_members WHERE temp_user_id = 'temp-debtor'");
    await client.execute("DELETE FROM temp_users WHERE id = 'temp-debtor'");
  }
});

it("rejects a creditor who is not a current session member", async () => {
  const response = await POST(request("98f0995e-2001-4d91-a94f-a8583f920a53", 3, "outsider"));
  expect(response.status).toBe(400);
  const rows = await client.execute("SELECT id FROM split_payments");
  expect(rows.rows).toHaveLength(0);
  expect(notifySplitPaymentReceived).not.toHaveBeenCalled();
});

it("never records more than the debt from two independent libSQL connections", async () => {
  const first = (await import("@/lib/splits/record-payment")).recordManualSplitPayment;
  const secondClient = createClient({ url: `file:${join(directory, "db.sqlite")}`, timeout: 0 });
  try {
    const secondDatabase = drizzle(secondClient, { schema });
    jest.resetModules();
    jest.doMock("@/lib/db/client", () => ({ db: secondDatabase }));
    const second = (await import("@/lib/splits/record-payment")).recordManualSplitPayment;
    const base = { sessionId: "session-a", actorId: "guest", payeeUserId: "owner", amount: 6 };
    const attempts = await Promise.allSettled([
      first({ ...base, operationId: "4b616a64-3560-4fd1-9aec-cf329e0c3cc4" }),
      second({ ...base, operationId: "85d7f515-825e-4f95-b4e6-698dfbd33856" }),
    ]);
    const rows = await client.execute("SELECT amount FROM split_payments");
    const total = rows.rows.reduce((sum, row) => sum + Number(row.amount), 0);
    expect(total).toBeLessThanOrEqual(10);
    expect(rows.rows).toHaveLength(1);
    expect(attempts.every((attempt) => attempt.status === "fulfilled")).toBe(true);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled" && !("error" in attempt.value))).toHaveLength(1);
    const errorStatuses = attempts.flatMap((attempt) =>
      attempt.status === "fulfilled" && "error" in attempt.value ? [attempt.value.status] : []);
    expect(errorStatuses).toHaveLength(1);
    expect([400, 409]).toContain(errorStatuses[0]);
  } finally {
    secondClient.close();
  }
});
