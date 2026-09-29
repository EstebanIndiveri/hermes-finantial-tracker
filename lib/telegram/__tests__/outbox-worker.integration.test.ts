import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

let client: Client;
let outbox: typeof import("../outbox");
let runWorker: typeof import("../outbox-worker").runTelegramOutboxWorker;
let temporaryDirectory: string;

async function deliveryState(id: string) {
  const result = await client.execute({
    sql: `SELECT status, attempt_count, lease_token, last_error_code,
                 last_http_status, provider_message_id
          FROM telegram_delivery_outbox WHERE id = ?`,
    args: [id],
  });
  return result.rows[0];
}

async function financialRowCounts() {
  const counts = await Promise.all([
    "transactions",
    "splits",
    "split_payments",
    "reimbursement_requests",
  ].map(async (table) => {
    const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
    return Number(result.rows[0].count);
  }));
  return counts;
}

function providerResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-outbox-worker-"));
  const databasePath = join(temporaryDirectory, "hermes.db");
  client = createClient({ url: `file:${databasePath}`, timeout: 0 });
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
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

  const database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  outbox = await import("../outbox");
  ({ runTelegramOutboxWorker: runWorker } = await import("../outbox-worker"));
});

afterAll(() => {
  client.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
});

it("retries a transient provider failure once while concurrent workers deliver one outbox row", async () => {
  await client.execute({
    sql: `INSERT INTO telegram_operations
      (operation_id, bot_id, update_id, operation_kind, status)
      VALUES (?, ?, ?, ?, ?)`,
    args: ["worker-operation", "bot-test", "update-test", "outbox.test", "committed"],
  });
  const queued = await outbox.enqueueTelegramDelivery({
    id: "worker-delivery",
    botId: "bot-test",
    updateId: "update-test",
    operationId: "worker-operation",
    deliveryKey: "worker-delivery-key",
    action: "edit_message",
    chatId: "synthetic-chat",
    messageId: 123,
    text: "Controlled outbox retry test",
    now: 1_000,
  });
  const baselineFinancialCounts = await financialRowCounts();
  let currentTime = 1_000;
  let signalProviderRequest!: () => void;
  let releaseResponse!: () => void;
  const providerStarted = new Promise<void>((resolve) => { signalProviderRequest = resolve; });
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(providerResponse(503, { ok: false }))
    .mockImplementationOnce(async () => {
      signalProviderRequest();
      await responseGate;
      return providerResponse(200, {
        ok: true,
        result: { message_id: 123 },
      });
    });

  const firstAttempt = await runWorker({
    botId: "bot-test",
    token: "synthetic-test-token",
    now: () => currentTime,
    fetchImpl,
  });
  expect(firstAttempt).toEqual({ claimed: 1, sent: 0, retryable: 1, dead: 0, purged: 0 });
  expect(await deliveryState(queued.id)).toEqual(expect.objectContaining({
    status: "retryable",
    attempt_count: 1,
    last_error_code: "provider_unavailable",
    last_http_status: 503,
  }));

  currentTime = 2_000;
  const winningWorker = runWorker({
    botId: "bot-test",
    token: "synthetic-test-token",
    now: () => currentTime,
    fetchImpl,
  });
  await providerStarted;

  const duplicateWorker = await runWorker({
    botId: "bot-test",
    token: "synthetic-test-token",
    now: () => currentTime,
    fetchImpl,
  });
  expect(duplicateWorker).toEqual({ claimed: 0, sent: 0, retryable: 0, dead: 0, purged: 0 });
  expect(await deliveryState(queued.id)).toEqual(expect.objectContaining({
    status: "processing",
    attempt_count: 2,
  }));

  releaseResponse();
  const winningResult = await winningWorker;
  expect(winningResult).toEqual({ claimed: 1, sent: 1, retryable: 0, dead: 0, purged: 0 });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(await deliveryState(queued.id)).toEqual(expect.objectContaining({
    status: "sent",
    attempt_count: 2,
    lease_token: null,
    last_error_code: null,
    provider_message_id: "123",
  }));
  await expect(financialRowCounts()).resolves.toEqual(baselineFinancialCounts);
});
