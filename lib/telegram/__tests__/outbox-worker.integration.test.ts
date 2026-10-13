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
  expect(firstAttempt).toEqual({ claimed: 1, sent: 0, retryable: 1, dead: 0, lostLease: 0, purged: 0 });
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
  expect(duplicateWorker).toEqual({ claimed: 0, sent: 0, retryable: 0, dead: 0, lostLease: 0, purged: 0 });
  expect(await deliveryState(queued.id)).toEqual(expect.objectContaining({
    status: "processing",
    attempt_count: 2,
  }));

  releaseResponse();
  const winningResult = await winningWorker;
  expect(winningResult).toEqual({ claimed: 1, sent: 1, retryable: 0, dead: 0, lostLease: 0, purged: 0 });
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

it("reports a lost lease when another worker confirms an expired claim first", async () => {
  await client.execute({
    sql: `INSERT INTO telegram_operations
      (operation_id, bot_id, update_id, operation_kind, status)
      VALUES (?, ?, ?, ?, ?)`,
    args: ["expired-operation", "bot-test", "expired-update", "outbox.test", "committed"],
  });
  const queued = await outbox.enqueueTelegramDelivery({
    id: "expired-delivery",
    botId: "bot-test",
    updateId: "expired-update",
    operationId: "expired-operation",
    deliveryKey: "expired-delivery-key",
    action: "edit_message",
    chatId: "synthetic-chat",
    messageId: 456,
    text: "Controlled lease expiry test",
    now: 10_000,
  });
  let currentTime = 10_000;
  let signalFirstRequest!: () => void;
  let releaseFirstResponse!: () => void;
  const firstRequest = new Promise<void>((resolve) => { signalFirstRequest = resolve; });
  const firstResponseGate = new Promise<void>((resolve) => { releaseFirstResponse = resolve; });
  const fetchImpl = jest.fn()
    .mockImplementationOnce(async () => {
      signalFirstRequest();
      await firstResponseGate;
      return providerResponse(200, { ok: true, result: { message_id: 456 } });
    })
    .mockResolvedValueOnce(providerResponse(200, { ok: true, result: { message_id: 456 } }));

  const slowWorker = runWorker({ botId: "bot-test", token: "synthetic-test-token", now: () => currentTime, fetchImpl, maxClaims: 1 });
  await firstRequest;
  currentTime = 71_000;
  const newWorker = await runWorker({ botId: "bot-test", token: "synthetic-test-token", now: () => currentTime, fetchImpl, maxClaims: 1 });
  expect(newWorker).toEqual({ claimed: 1, sent: 1, retryable: 0, dead: 0, lostLease: 0, purged: 0 });

  releaseFirstResponse();
  await expect(slowWorker).resolves.toEqual({ claimed: 1, sent: 0, retryable: 0, dead: 0, lostLease: 1, purged: 0 });
  expect(await deliveryState(queued.id)).toEqual(expect.objectContaining({
    status: "sent",
    attempt_count: 2,
    provider_message_id: "456",
  }));
});

it("drains a bounded concurrent backlog through rate limits without duplicate provider calls", async () => {
  const deliveryCount = 40;
  const baselineFinancialCounts = await financialRowCounts();
  for (let index = 0; index < deliveryCount; index += 1) {
    await client.execute({
      sql: `INSERT INTO telegram_operations
        (operation_id, bot_id, update_id, operation_kind, status)
        VALUES (?, ?, ?, ?, ?)`,
      args: [`load-operation-${index}`, "bot-test", `load-update-${index}`, "outbox.test", "committed"],
    });
    await outbox.enqueueTelegramDelivery({
      id: `load-delivery-${index}`,
      botId: "bot-test",
      updateId: `load-update-${index}`,
      operationId: `load-operation-${index}`,
      deliveryKey: `load-key-${index}`,
      action: "send_message",
      chatId: `synthetic-chat-${index}`,
      text: "Controlled saturation test",
      now: 100_000,
    });
  }

  const providerCalls = new Map<string, number>();
  const fetchImpl = jest.fn(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body)) as { chat_id: string };
    const count = (providerCalls.get(body.chat_id) ?? 0) + 1;
    providerCalls.set(body.chat_id, count);
    return count === 1
      ? providerResponse(429, { ok: false, parameters: { retry_after: 1 } })
      : providerResponse(200, { ok: true, result: { message_id: count } });
  }) as unknown as typeof fetch;

  async function statusCount(status: "retryable" | "sent"): Promise<number> {
    const result = await client.execute({
      sql: "SELECT COUNT(*) AS count FROM telegram_delivery_outbox WHERE id LIKE 'load-delivery-%' AND status = ?",
      args: [status],
    });
    return Number(result.rows[0].count);
  }

  async function drainUntil(status: "retryable" | "sent", now: number): Promise<number> {
    let claimed = 0;
    for (let round = 0; round < 20 && await statusCount(status) < deliveryCount; round += 1) {
      const results = await Promise.all(Array.from({ length: 4 }, () => runWorker({
        botId: "bot-test",
        token: "synthetic-test-token",
        now: () => now,
        maxClaims: 5,
        fetchImpl,
      })));
      for (const result of results) {
        expect(result.claimed).toBeLessThanOrEqual(5);
        expect(result.dead).toBe(0);
        expect(result.lostLease).toBe(0);
        expect(result[status]).toBe(result.claimed);
        claimed += result.claimed;
      }
    }
    expect(await statusCount(status)).toBe(deliveryCount);
    return claimed;
  }

  expect(await drainUntil("retryable", 100_000)).toBe(deliveryCount);
  expect(await drainUntil("sent", 101_000)).toBe(deliveryCount);
  expect(fetchImpl).toHaveBeenCalledTimes(deliveryCount * 2);
  expect([...providerCalls.values()]).toEqual(Array(deliveryCount).fill(2));
  expect([...providerCalls.keys()].sort()).toEqual(
    Array.from({ length: deliveryCount }, (_, index) => `synthetic-chat-${index}`).sort(),
  );
  const attempts = await client.execute("SELECT MIN(attempt_count) AS minimum, MAX(attempt_count) AS maximum FROM telegram_delivery_outbox WHERE id LIKE 'load-delivery-%'");
  expect(attempts.rows[0]).toEqual(expect.objectContaining({ minimum: 2, maximum: 2 }));
  await expect(financialRowCounts()).resolves.toEqual(baselineFinancialCounts);
});
