import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
jest.mock("@/lib/db/client", () => ({ db: {} }));
import * as schema from "@/lib/db/schema";
import { enqueueWebReimbursementTelegram } from "../requests";
import { telegram_operations } from "@/lib/db/schema";
import { createTelegramOperationContext, createTelegramOperationIdentity } from "@/lib/telegram/operation-context";
import type { TelegramOperationTransaction } from "@/lib/telegram/financial-operation";

const migrationPath = join(process.cwd(), "lib/db/migrations/0010_telegram_operations_outbox.sql");
const notification = { text: "Solicitud de reintegro", replyMarkup: { inline_keyboard: [] } };

let client: Client;
let temporaryDirectory: string;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-web-reimbursement-outbox-"));
  client = createClient({ url: `file:${join(temporaryDirectory, "hermes.db")}`, timeout: 0 });
  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(`
    CREATE TABLE transactions (id TEXT PRIMARY KEY);
    CREATE TABLE splits (id TEXT PRIMARY KEY);
    CREATE TABLE split_payments (id TEXT PRIMARY KEY);
    CREATE TABLE reimbursement_requests (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      payer_id TEXT,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      paid_at TEXT,
      created_at INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE recurring_executions (
      id TEXT PRIMARY KEY,
      recurring_expense_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL
    );
  `);
  await client.executeMultiple(readFileSync(migrationPath, "utf8"));
  testDb = drizzle(client, { schema });
});

afterAll(() => {
  client.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

beforeEach(async () => {
  await client.execute("DELETE FROM telegram_delivery_outbox");
  await client.execute("DELETE FROM reimbursement_requests");
  await client.execute("DELETE FROM telegram_operations");
});

function context(requestId: string, botId = "beta-bot") {
  const updateId = `web-reimbursement:${requestId}`;
  const operationContext = createTelegramOperationContext({
    botId,
    updateId,
    chatId: "web",
    action: "web.reimbursement.create",
    suffix: requestId,
  });
  return { updateId, operationContext, identity: createTelegramOperationIdentity(operationContext) };
}

it("commits one worker-eligible delivery per linked member, excluding the requester", async () => {
  const { updateId, operationContext, identity } = context("request-a");
  await testDb.transaction(async (transaction) => {
    await transaction.insert(telegram_operations).values({
      operation_id: identity.operationId,
      bot_id: "beta-bot",
      update_id: updateId,
      operation_kind: "web.reimbursement.create",
      status: "committed",
      resource_type: "reimbursement",
      resource_id: "request-a",
      result_json: JSON.stringify({ id: "request-a" }),
    });
    await transaction.insert(schema.reimbursementRequests).values({
      id: "request-a", transactionId: "tx-a", requesterId: "requester", amount: 2500, status: "pending",
    });
    await enqueueWebReimbursementTelegram(
      transaction as unknown as TelegramOperationTransaction,
      operationContext,
      identity.operationId,
      "requester",
      [
        { userId: "requester", telegramId: "chat-requester" },
        { userId: "payer", telegramId: "chat-payer" },
        { userId: "other-member", telegramId: "chat-other-member" },
        { userId: "unlinked", telegramId: null },
      ],
      notification,
    );
  });

  const rows = await client.execute("SELECT bot_id, update_id, operation_id, chat_id, status FROM telegram_delivery_outbox");
  expect(rows.rows).toHaveLength(2);
  expect(rows.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({
    bot_id: "beta-bot",
    update_id: updateId,
    operation_id: identity.operationId,
    chat_id: "chat-payer",
    status: "pending",
    }),
    expect.objectContaining({ chat_id: "chat-other-member", status: "pending" }),
  ]));
});

it("rolls back the reimbursement and operation when the outbox namespace FK rejects a delivery", async () => {
  const { updateId, identity } = context("request-b");
  const wrongContext = context("request-b", "wrong-bot").operationContext;
  await expect(testDb.transaction(async (transaction) => {
    await transaction.insert(telegram_operations).values({
      operation_id: identity.operationId,
      bot_id: "beta-bot",
      update_id: updateId,
      operation_kind: "web.reimbursement.create",
      status: "committed",
      resource_type: "reimbursement",
      resource_id: "request-b",
      result_json: JSON.stringify({ id: "request-b" }),
    });
    await transaction.insert(schema.reimbursementRequests).values({
      id: "request-b", transactionId: "tx-b", requesterId: "requester", amount: 1200, status: "pending",
    });
    await enqueueWebReimbursementTelegram(
      transaction as unknown as TelegramOperationTransaction,
      wrongContext,
      identity.operationId,
      "requester",
      [{ userId: "payer", telegramId: "chat-payer" }],
      notification,
    );
  })).rejects.toBeDefined();

  const counts = await client.execute(`
    SELECT
      (SELECT COUNT(*) FROM reimbursement_requests WHERE id = 'request-b') AS requests,
      (SELECT COUNT(*) FROM telegram_operations WHERE resource_id = 'request-b') AS operations,
      (SELECT COUNT(*) FROM telegram_delivery_outbox WHERE operation_id = ?) AS deliveries
  `, [identity.operationId]);
  expect(counts.rows[0]).toMatchObject({ requests: 0, operations: 0, deliveries: 0 });
});
