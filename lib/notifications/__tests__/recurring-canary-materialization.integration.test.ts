import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

let client: Client;
let directory: string;
let materialize: typeof import("../recurring-canary-materialization").materializeCanaryUpcomingExecutions;
let scope: jest.Mock;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "hermes-recurring-materialization-"));
  client = createClient({ url: `file:${join(directory, "db.sqlite")}`, timeout: 0 });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, active_telegram_group_id TEXT);
    CREATE TABLE groups (id TEXT PRIMARY KEY);
    CREATE TABLE group_members (group_id TEXT NOT NULL REFERENCES groups(id),
      user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id));
    CREATE TABLE categories (id TEXT PRIMARY KEY);
    CREATE TABLE transactions (id TEXT PRIMARY KEY);
    CREATE TABLE recurring_expenses (id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id), group_id TEXT REFERENCES groups(id),
      name TEXT NOT NULL, amount_ars REAL NOT NULL, category_id TEXT REFERENCES categories(id),
      merchant TEXT, frequency TEXT NOT NULL, day_of_month INTEGER NOT NULL,
      is_active INTEGER NOT NULL, auto_confirm INTEGER NOT NULL, notes TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE recurring_executions (id TEXT PRIMARY KEY,
      recurring_expense_id TEXT NOT NULL REFERENCES recurring_expenses(id),
      transaction_id TEXT REFERENCES transactions(id), scheduled_date TEXT NOT NULL,
      executed_at INTEGER, status TEXT NOT NULL, amount_ars REAL,
      created_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX execution_recurring_date_idx
      ON recurring_executions(recurring_expense_id, scheduled_date);
    INSERT INTO users VALUES ('qa', 'personal');
    INSERT INTO groups VALUES ('personal');
    INSERT INTO group_members VALUES ('personal', 'qa', 'owner');
    INSERT INTO recurring_expenses
      (id, user_id, group_id, name, amount_ars, frequency, day_of_month,
       is_active, auto_confirm, created_at, updated_at)
      VALUES ('netflix', 'qa', 'personal', 'Netflix', 3000, 'monthly', 18, 1, 0, 0, 0);
  `);
  const database = drizzle(client, { schema });
  scope = jest.fn(() => ({ mode: "canary", userId: "qa", groupId: "personal" }));
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  jest.doMock("../recurring-reminder-canary", () => ({ getRecurringReminderScope: scope }));
  ({ materializeCanaryUpcomingExecutions: materialize } = await import("../recurring-canary-materialization"));
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
  jest.dontMock("../recurring-reminder-canary");
});

beforeEach(async () => {
  scope.mockReturnValue({ mode: "canary", userId: "qa", groupId: "personal" });
  await client.execute("DELETE FROM recurring_executions");
  await client.execute("UPDATE users SET active_telegram_group_id='personal' WHERE id='qa'");
});

it("materializes one pending occurrence under concurrent canary calls without a transaction", async () => {
  const counts = await Promise.all([
    materialize("qa", "personal", "2026-10-18"),
    materialize("qa", "personal", "2026-10-18"),
  ]);
  expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1);

  const executions = await client.execute(
    "SELECT recurring_expense_id, scheduled_date, status, amount_ars, transaction_id FROM recurring_executions",
  );
  expect(executions.rows).toEqual([{
    recurring_expense_id: "netflix",
    scheduled_date: "2026-10-18",
    status: "pending",
    amount_ars: 3000,
    transaction_id: null,
  }]);
  const transactions = await client.execute("SELECT id FROM transactions");
  expect(transactions.rows).toHaveLength(0);
});

it("does not materialize outside the canary or after the Telegram group changes", async () => {
  scope.mockReturnValue({ mode: "off" });
  expect(await materialize("qa", "personal", "2026-10-18")).toBe(0);
  scope.mockReturnValue({ mode: "canary", userId: "qa", groupId: "personal" });
  await client.execute("UPDATE users SET active_telegram_group_id='other' WHERE id='qa'");
  expect(await materialize("qa", "personal", "2026-10-18")).toBe(0);
  const executions = await client.execute("SELECT id FROM recurring_executions");
  expect(executions.rows).toHaveLength(0);
});
