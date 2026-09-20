import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";
import { runTelegramOperation, type TelegramOperationTransactionRunner } from "../financial-operation";
import { createTelegramOperationContext, createTelegramOperationIdentity } from "../operation-context";

let client: Client;
let database: ReturnType<typeof drizzle<typeof schema>>;
let temporaryDirectory: string;

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-financial-operation-"));
  client = createClient({ url: `file:${join(temporaryDirectory, "hermes.db")}`, timeout: 0 });
  await client.executeMultiple(`
    CREATE TABLE transactions (id TEXT PRIMARY KEY);
    CREATE TABLE splits (id TEXT PRIMARY KEY);
    CREATE TABLE split_payments (id TEXT PRIMARY KEY);
    CREATE TABLE reimbursement_requests (id TEXT PRIMARY KEY);
    CREATE TABLE recurring_executions (
      id TEXT PRIMARY KEY,
      recurring_expense_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL
    );
  `);
  await client.executeMultiple(
    readFileSync(join(process.cwd(), "lib/db/migrations/0010_telegram_operations_outbox.sql"), "utf8"),
  );
  database = drizzle(client, { schema });
});

afterAll(() => {
  client.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function operationInput(suffix = "proposal-1") {
  const context = createTelegramOperationContext({
    botId: "bot-a",
    updateId: "100",
    chatId: "chat-a",
    action: "expense.confirm",
    suffix,
  });
  return {
    identity: createTelegramOperationIdentity(context),
    botId: context.botId,
    updateId: context.updateId,
    operationKind: `${context.action}:${context.suffix}`,
    now: 1_000,
  };
}

function runner(): TelegramOperationTransactionRunner {
  return (work) => database.transaction(work);
}

it("commits once and reuses the durable result on retry", async () => {
  let writes = 0;
  const input = operationInput();
  const first = await runTelegramOperation(runner(), input, async () => {
    writes += 1;
    return { resourceType: "transaction", resourceId: "tx-1", result: { amount: 1500 } };
  });
  const second = await runTelegramOperation(runner(), input, async () => {
    writes += 1;
    return { resourceType: "transaction", resourceId: "tx-2", result: { amount: 2000 } };
  });

  expect(first).toEqual(expect.objectContaining({ reused: false, resourceId: "tx-1" }));
  expect(second).toEqual(expect.objectContaining({ reused: true, resourceId: "tx-1", result: { amount: 1500 } }));
  expect(writes).toBe(1);
});

it("allows one writer across ten parallel retries", async () => {
  let writes = 0;
  const input = operationInput("parallel");
  const results = await Promise.all(Array.from({ length: 10 }, () => runTelegramOperation(
    runner(),
    input,
    async () => {
      writes += 1;
      return { resourceType: "transaction", resourceId: "tx-parallel", result: { amount: 3000 } };
    },
  )));

  expect(writes).toBe(1);
  expect(results).toHaveLength(10);
  expect(results.every((result) =>
    result.kind === "committed" && result.resourceId === "tx-parallel")).toBe(true);
});

it("rolls the registry claim back when the writer fails", async () => {
  const input = operationInput("rollback");
  await expect(runTelegramOperation(runner(), input, async () => {
    throw new Error("writer failed");
  })).rejects.toThrow("writer failed");

  const count = await client.execute({
    sql: "SELECT COUNT(*) AS count FROM telegram_operations WHERE operation_id = ?",
    args: [input.identity.operationId],
  });
  expect(Number(count.rows[0].count)).toBe(0);
});

it("keeps distinct action suffixes independent", async () => {
  const first = await runTelegramOperation(runner(), operationInput("one"), async () => ({
    resourceType: "transaction",
    resourceId: "tx-one",
    result: { amount: 1 },
  }));
  const second = await runTelegramOperation(runner(), operationInput("two"), async () => ({
    resourceType: "transaction",
    resourceId: "tx-two",
    result: { amount: 2 },
  }));
  expect(first).toEqual(expect.objectContaining({ resourceId: "tx-one" }));
  expect(second).toEqual(expect.objectContaining({ resourceId: "tx-two" }));
});
