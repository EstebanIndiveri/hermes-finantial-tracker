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
let PATCH: typeof import("../../../../items/[id]/route").PATCH;

const validBody = {
  description: "Cena QA",
  totalAmount: 10.01,
  splitType: "fixed",
  payers: [{ userId: "owner", amountPaid: 10.01 }],
  participants: [
    { userId: "owner", amount: 5.01 },
    { userId: "friend", amount: 5 },
  ],
};

async function post(body: unknown) {
  const request = new NextRequest("http://localhost/api/splits/sessions/session-a/items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": "owner" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id: "session-a" }) });
}

async function patch(id: string, body: unknown, userId = "owner") {
  const request = new NextRequest(`http://localhost/api/splits/items/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-user-id": userId },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

async function counts() {
  const names = ["splits", "split_payers", "split_items"];
  return Promise.all(names.map(async name => {
    const result = await client.execute(`SELECT count(*) AS count FROM ${name}`);
    return Number(result.rows[0].count);
  }));
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "hermes-split-create-"));
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
    INSERT INTO users VALUES ('owner'), ('friend'), ('outsider');
    INSERT INTO split_sessions (id, name, owner_user_id, status, created_at)
      VALUES ('session-a', 'QA', 'owner', 'open', 1);
    INSERT INTO split_session_members VALUES ('session-a', 'owner', NULL, 1),
      ('session-a', 'friend', NULL, 1);
  `);
  const database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  ({ POST } = await import("../route"));
  ({ PATCH } = await import("../../../../items/[id]/route"));
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
});

beforeEach(async () => {
  await client.execute("DROP TRIGGER IF EXISTS reject_item");
  await client.execute("DELETE FROM split_payments");
  await client.execute("DELETE FROM split_items");
  await client.execute("DELETE FROM split_payers");
  await client.execute("DELETE FROM splits");
  await client.execute("UPDATE split_sessions SET status='open' WHERE id='session-a'");
});

it("creates a balanced split for session members", async () => {
  expect((await post(validBody)).status).toBe(201);
  expect(await counts()).toEqual([1, 1, 2]);
});

it("rejects payer and participant sums that do not equal the total", async () => {
  expect((await post({ ...validBody, payers: [{ userId: "owner", amountPaid: 10 }] })).status).toBe(400);
  expect((await post({ ...validBody, participants: [{ userId: "friend", amount: 10 }] })).status).toBe(400);
  expect(await counts()).toEqual([0, 0, 0]);
});

it("rejects outsiders, duplicate identities and ambiguous identities", async () => {
  expect((await post({ ...validBody, participants: [{ userId: "outsider", amount: 10.01 }] })).status).toBe(400);
  expect((await post({ ...validBody, participants: [
    { userId: "owner", amount: 5.01 }, { userId: "owner", amount: 5 },
  ] })).status).toBe(400);
  expect((await post({ ...validBody, payers: [{ userId: "owner", tempUserId: "temp", amountPaid: 10.01 }] })).status).toBe(400);
  expect(await counts()).toEqual([0, 0, 0]);
});

it("rejects percentages that do not total 100", async () => {
  expect((await post({ ...validBody, splitType: "percentage", participants: [
    { userId: "owner", amount: 5.01, percentage: 50 },
    { userId: "friend", amount: 5, percentage: 49 },
  ] })).status).toBe(400);
  expect(await counts()).toEqual([0, 0, 0]);
});

it("accepts balanced percentage allocations and rejects sub-cent money", async () => {
  expect((await post({ ...validBody, splitType: "percentage", participants: [
    { userId: "owner", amount: 5.01, percentage: 50 },
    { userId: "friend", amount: 5, percentage: 50 },
  ] })).status).toBe(201);
  expect((await post({ ...validBody, totalAmount: 10.001,
    payers: [{ userId: "owner", amountPaid: 10.001 }],
    participants: [{ userId: "owner", amount: 10.001 }],
  })).status).toBe(400);
  expect(await counts()).toEqual([1, 1, 2]);
});

it("rolls back header and payers if the final item insert fails", async () => {
  await client.execute("CREATE TRIGGER reject_item BEFORE INSERT ON split_items BEGIN SELECT RAISE(FAIL, 'fixture failure'); END");
  expect((await post(validBody)).status).toBe(500);
  expect(await counts()).toEqual([0, 0, 0]);
});

it("does not change the total without replacing allocations", async () => {
  const id = (await (await post(validBody)).json()).id as string;
  expect((await patch(id, { totalAmount: 20 })).status).toBe(409);
  const row = await client.execute({ sql: "SELECT total_amount FROM splits WHERE id=?", args: [id] });
  expect(Number(row.rows[0].total_amount)).toBe(10.01);
});

it("does not cancel a split after any session payment", async () => {
  const id = (await (await post(validBody)).json()).id as string;
  await client.execute({ sql: `INSERT INTO split_payments
    (id, session_id, payer_user_id, payee_user_id, amount, method)
    VALUES (?, 'session-a', 'friend', 'owner', 5, 'manual')`, args: ["payment-a"] });
  expect((await patch(id, { status: "cancelled" })).status).toBe(409);
  const row = await client.execute({ sql: "SELECT status FROM splits WHERE id=?", args: [id] });
  expect(row.rows[0].status).toBe("active");
});

it("allows the owner to cancel once with no payments and rejects invalid edits", async () => {
  const id = (await (await post(validBody)).json()).id as string;
  expect((await patch(id, {})).status).toBe(400);
  expect((await patch(id, { status: "cancelled", totalAmount: 20 })).status).toBe(400);
  expect((await patch(id, { status: "cancelled" }, "friend")).status).toBe(403);
  expect((await patch(id, { status: "cancelled" })).status).toBe(200);
  await client.execute("UPDATE split_sessions SET status='closed' WHERE id='session-a'");
  expect((await patch(id, { status: "cancelled" })).status).toBe(200);
  const row = await client.execute({ sql: "SELECT status, cancelled_at FROM splits WHERE id=?", args: [id] });
  expect(row.rows[0].status).toBe("cancelled");
  expect(Number(row.rows[0].cancelled_at)).toBeGreaterThan(0);
});
