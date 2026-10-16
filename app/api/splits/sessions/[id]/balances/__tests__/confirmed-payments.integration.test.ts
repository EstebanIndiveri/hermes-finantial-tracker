import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import { NextRequest } from "next/server";
import * as schema from "@/lib/db/schema";

let directory: string;
let client: Client;
let GET: typeof import("../route").GET;
let getPaymentHistoryForUser: typeof import("@/lib/splits/payment-history").getPaymentHistoryForUser;
let calculateGlobalBalances: typeof import("@/lib/splits/global-balances").calculateGlobalBalances;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "hermes-pending-payment-"));
  client = createClient({ url: `file:${join(directory, "db.sqlite")}`, timeout: 0 });
  await client.executeMultiple(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, username TEXT);
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
    INSERT INTO users VALUES ('owner','Owner',NULL), ('guest','Guest',NULL);
    INSERT INTO split_sessions (id,name,owner_user_id,status,created_at)
      VALUES ('session-a','QA','owner','open',1);
    INSERT INTO split_session_members VALUES ('session-a','owner',NULL,1),
      ('session-a','guest',NULL,1);
    INSERT INTO splits (id,session_id,description,total_amount,split_type,status,created_by_user_id,created_at)
      VALUES ('split-a','session-a','QA',20,'equal','active','owner',1);
    INSERT INTO split_payers VALUES ('payer-a','split-a','owner',NULL,20);
    INSERT INTO split_items VALUES ('item-owner','split-a','owner',NULL,10,NULL),
      ('item-guest','split-a','guest',NULL,10,NULL);
    INSERT INTO split_payments (id,session_id,payer_user_id,payee_user_id,amount,method,confirmed_at)
      VALUES ('confirmed','session-a','guest','owner',2,'manual',100),
        ('pending','session-a','guest','owner',8,'receipt_ocr',NULL);
  `);
  const database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  ({ GET } = await import("../route"));
  ({ getPaymentHistoryForUser } = await import("@/lib/splits/payment-history"));
  ({ calculateGlobalBalances } = await import("@/lib/splits/global-balances"));
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
});

it("keeps pending OCR out of session and global debt", async () => {
  const request = new NextRequest("http://localhost/api/splits/sessions/session-a/balances", {
    headers: { "x-user-id": "guest" },
  });
  const response = await GET(request, { params: Promise.resolve({ id: "session-a" }) });
  expect(response.status).toBe(200);
  expect((await response.json()).debts).toEqual([
    { from: { userId: "guest" }, to: { userId: "owner" }, amount: 8 },
  ]);
  const global = await calculateGlobalBalances("guest");
  expect(global.totalYouOwe).toBe(8);
});

it("counts and paginates only confirmed payments in history", async () => {
  const result = await getPaymentHistoryForUser("guest", { limit: 1 });
  expect(result.total).toBe(1);
  expect(result.items.map((item) => item.id)).toEqual(["confirmed"]);
});
