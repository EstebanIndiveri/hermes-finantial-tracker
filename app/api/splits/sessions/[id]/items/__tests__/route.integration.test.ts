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
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
});

beforeEach(async () => {
  await client.execute("DROP TRIGGER IF EXISTS reject_item");
  await client.execute("DELETE FROM split_items");
  await client.execute("DELETE FROM split_payers");
  await client.execute("DELETE FROM splits");
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
