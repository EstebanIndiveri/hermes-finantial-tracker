import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";
import { formatResumen } from "@/lib/telegram/formatters";

let client: Client;
let temporaryDirectory: string;
let getMonthSummary: typeof import("../summaries").getMonthSummary;

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-summary-"));
  client = createClient({ url: `file:${join(temporaryDirectory, "summary.db")}`, timeout: 0 });
  await client.executeMultiple(`
    CREATE TABLE monthly_settings (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_id TEXT NOT NULL,
      month TEXT NOT NULL, currency_mode TEXT NOT NULL DEFAULT 'USD_ARS',
      income_usd REAL, income_ars REAL, exchange_rate REAL,
      exchange_rate_source TEXT NOT NULL DEFAULT 'manual',
      exchange_rate_updated_at INTEGER, saving_goal_usd REAL DEFAULT 0,
      saving_goal_ars REAL, saving_goal_yellow_ars REAL,
      saving_goal_yellow REAL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL, slug TEXT NOT NULL,
      name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
      default_hard_limit INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_id TEXT NOT NULL,
      category_id TEXT NOT NULL, amount_ars REAL NOT NULL, amount_usd REAL,
      date TEXT NOT NULL, month TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'web',
      status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL DEFAULT 0
    );
  `);
  await client.batch([
    { sql: "INSERT INTO monthly_settings (id,user_id,group_id,month,income_usd,exchange_rate) VALUES (?,?,?,?,?,?)", args: ["s-a-sep", "u-a", "g-a", "2026-09", 1000, 1600] },
    { sql: "INSERT INTO monthly_settings (id,user_id,group_id,month,income_usd,exchange_rate) VALUES (?,?,?,?,?,?)", args: ["s-a-aug", "u-a", "g-a", "2026-08", 900, 1500] },
    { sql: "INSERT INTO monthly_settings (id,user_id,group_id,month,income_usd,exchange_rate) VALUES (?,?,?,?,?,?)", args: ["s-b-sep", "u-b", "g-b", "2026-09", 2000, 1700] },
    { sql: "INSERT INTO monthly_settings (id,user_id,group_id,month,currency_mode,income_ars) VALUES (?,?,?,?,?,?)", args: ["s-ars-oct", "u-a", "g-a", "2026-10", "ARS_ARS", 100000] },
    { sql: "INSERT INTO categories (id,group_id,slug,name) VALUES (?,?,?,?)", args: ["c-a-income", "g-a", "ingresos", "Ingresos"] },
    { sql: "INSERT INTO categories (id,group_id,slug,name) VALUES (?,?,?,?)", args: ["c-a-super", "g-a", "supermercado", "Supermercado"] },
    { sql: "INSERT INTO categories (id,group_id,slug,name) VALUES (?,?,?,?)", args: ["c-b-super", "g-b", "supermercado", "Supermercado"] },
  ]);
  const transaction = async (id: string, group: string, category: string, month: string, usd: number, status = "active") => {
    const exchangeRateAtWrite = group === "g-b" ? 1700 : month === "2026-08" ? 1500 : 1600;
    await client.execute({
      sql: "INSERT INTO transactions (id,user_id,group_id,category_id,amount_ars,amount_usd,date,month,status) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [id, `u-${group}`, group, category, usd * exchangeRateAtWrite, usd, `${month}-15`, month, status],
    });
  };
  await transaction("income-a", "g-a", "c-a-income", "2026-09", 2.5);
  await transaction("expense-a", "g-a", "c-a-super", "2026-09", 74.23);
  await transaction("deleted-a", "g-a", "c-a-super", "2026-09", 100, "deleted");
  await transaction("other-month", "g-a", "c-a-super", "2026-08", 20);
  await transaction("other-group", "g-b", "c-b-super", "2026-09", 300);

  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: drizzle(client, { schema }) }));
  ({ getMonthSummary } = await import("../summaries"));
});

afterAll(() => {
  client.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
});

it("reconciles the displayed USD totals for only the requested group and month", async () => {
  const summary = await getMonthSummary("g-a", "2026-09");
  expect(summary).toMatchObject({
    configured_income_usd: 1000,
    extra_income_usd: 2.5,
    income_usd: 1002.5,
    total_spent_usd: 74.23,
    ahorro_proyectado_usd: 928.27,
    exchange_rate: 1600,
  });
  if (!summary) throw new Error("Expected September summary for group A");
  const message = formatResumen({ month: "2026-09", ...summary });
  expect(message).toContain("Ingreso: USD $1,002.50");
  expect(message).toContain("Gastado: USD $74.23");
  expect(message).toContain("Ahorro proyectado: USD $928.27");
  expect(await getMonthSummary("g-a", "2026-08")).toMatchObject({
    income_usd: 900,
    total_spent_usd: 20,
    ahorro_proyectado_usd: 880,
  });
  expect(await getMonthSummary("g-b", "2026-09")).toMatchObject({
    income_usd: 2000,
    total_spent_usd: 300,
    ahorro_proyectado_usd: 1700,
  });
  expect(await getMonthSummary("g-b", "2026-08")).toBeNull();
  expect(await getMonthSummary("g-a", "2026-10")).toBeNull();
});

it("does not project an incomplete USD configuration as zero-valued income", async () => {
  await client.execute({
    sql: "INSERT INTO monthly_settings (id,user_id,group_id,month,currency_mode,income_usd,exchange_rate,saving_goal_usd,saving_goal_yellow) VALUES (?,?,?,?,?,?,?,?,?)",
    args: ["s-incomplete", "u-a", "g-a", "2026-11", "USD_ARS", null, 1600, 0, 0],
  });
  expect(await getMonthSummary("g-a", "2026-11")).toBeNull();

  await client.execute({
    sql: "INSERT INTO monthly_settings (id,user_id,group_id,month,currency_mode,income_usd,exchange_rate,saving_goal_usd,saving_goal_yellow) VALUES (?,?,?,?,?,?,?,?,?)",
    args: ["s-usd-dec", "u-a", "g-a", "2026-12", "USD_ARS", 1000, 1600, 0, 0],
  });
  await client.execute({
    sql: "INSERT INTO transactions (id,user_id,group_id,category_id,amount_ars,amount_usd,date,month,status) VALUES (?,?,?,?,?,?,?,?,?)",
    args: ["tx-missing-usd", "u-a", "g-a", "c-a-super", 500, null, "2026-12-01", "2026-12", "active"],
  });
  expect(await getMonthSummary("g-a", "2026-12")).toBeNull();
});
