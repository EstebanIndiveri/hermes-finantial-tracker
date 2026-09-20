import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

let client: Client;
let outbox: typeof import("../outbox");
let temporaryDirectory: string;

async function stored(id: string) {
  const result = await client.execute({
    sql: `SELECT status, attempt_count, lease_token, lease_expires_at,
                 last_error_code, provider_message_id
          FROM telegram_delivery_outbox WHERE id = ?`,
    args: [id],
  });
  return result.rows[0];
}

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-telegram-outbox-"));
  const databasePath = join(temporaryDirectory, "hermes.db");
  client = createClient({ url: `file:${databasePath}`, timeout: 0 });
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
  await client.execute({
    sql: `INSERT INTO telegram_operations
      (operation_id, bot_id, update_id, operation_kind, status)
      VALUES (?, ?, ?, ?, ?)`,
    args: ["operation-1", "bot-1", "update-1", "outbox.test", "committed"],
  });

  const database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  outbox = await import("../outbox");
});

afterAll(() => {
  client.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
});

function input(deliveryKey = "delivery-key") {
  return {
    id: `id-${deliveryKey}`,
    botId: "bot-1",
    updateId: "update-1",
    operationId: "operation-1",
    deliveryKey,
    action: "send_message" as const,
    chatId: "chat-1",
    text: "Confirmado",
    now: 1_000,
  };
}

it("enqueues one row for a repeated logical delivery", async () => {
  const first = await outbox.enqueueTelegramDelivery(input("unique-delivery"));
  const second = await outbox.enqueueTelegramDelivery({
    ...input("unique-delivery"),
    id: "different-id",
  });

  expect(second.id).toBe(first.id);
  const count = await client.execute(
    "SELECT COUNT(*) AS count FROM telegram_delivery_outbox WHERE delivery_key = 'unique-delivery'",
  );
  expect(Number(count.rows[0].count)).toBe(1);
});

it("updates a pending envelope and exposes it for recovery", async () => {
  const queued = await outbox.enqueueTelegramDelivery(input("replace-envelope"));
  await expect(outbox.hasRecoverableTelegramDeliveries("bot-1", "update-1")).resolves.toBe(true);
  await expect(outbox.updateTelegramDeliveryEnvelope({
    botId: "bot-1",
    operationId: queued.operation_id!,
    deliveryKey: queued.delivery_key,
    text: "Confirmacion completa",
    replyMarkup: { inline_keyboard: [] },
    now: 1_500,
  })).resolves.toBe(1);

  const result = await client.execute({
    sql: "SELECT text, reply_markup_json, next_attempt_at FROM telegram_delivery_outbox WHERE id = ?",
    args: [queued.id],
  });
  expect(result.rows[0]).toEqual(expect.objectContaining({
    text: "Confirmacion completa",
    reply_markup_json: JSON.stringify({ inline_keyboard: [] }),
    next_attempt_at: 1_500,
  }));
});

it("keeps sent delivery operation kinds visible for inbox crash recovery", async () => {
  const queued = await outbox.enqueueTelegramDelivery(input("sent-recovery-delivery"));
  const claimed = await outbox.claimTelegramDelivery({
    id: queued.id,
    now: 1_600,
    leaseToken: "sent-recovery-lease",
  });
  expect(claimed).not.toBeNull();
  await expect(outbox.markTelegramDeliverySent({
    id: queued.id,
    leaseToken: "sent-recovery-lease",
    providerMessageId: "99",
    now: 1_700,
  })).resolves.toBe(true);

  await expect(outbox.telegramDeliveryOperationKinds("bot-1", "update-1"))
    .resolves.toContain("outbox.test");
});

it("does not expose committed child operations that do not own a delivery", async () => {
  await client.execute({
    sql: `INSERT INTO telegram_operations
      (operation_id, bot_id, update_id, operation_kind, status)
      VALUES (?, ?, ?, ?, ?)`,
    args: [
      "operation-child-without-outbox",
      "bot-1",
      "update-1",
      "recurring.confirm:batch-child",
      "committed",
    ],
  });

  await expect(outbox.telegramDeliveryOperationKinds("bot-1", "update-1"))
    .resolves.not.toContain("recurring.confirm:batch-child");
});

it("gives one owner across ten parallel claims", async () => {
  const queued = await outbox.enqueueTelegramDelivery(input("parallel-delivery"));
  const claims = await Promise.all(
    Array.from({ length: 10 }, (_, index) => outbox.claimTelegramDelivery({
      id: queued.id,
      now: 2_000,
      leaseToken: `lease-${index}`,
    })),
  );

  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(await stored(queued.id)).toEqual(expect.objectContaining({
    status: "processing",
    attempt_count: 1,
  }));
});

it("reclaims an expired lease and fences the stale owner", async () => {
  const queued = await outbox.enqueueTelegramDelivery(input("lease-delivery"));
  await expect(outbox.claimTelegramDelivery({
    id: queued.id,
    now: 3_000,
    leaseMs: 100,
    leaseToken: "old-lease",
  })).resolves.toEqual(expect.objectContaining({ lease_token: "old-lease" }));

  await expect(outbox.claimTelegramDelivery({
    id: queued.id,
    now: 3_100,
    leaseMs: 100,
    leaseToken: "new-lease",
  })).resolves.toEqual(expect.objectContaining({ lease_token: "new-lease", attempt_count: 2 }));

  await expect(outbox.markTelegramDeliverySent({
    id: queued.id,
    leaseToken: "old-lease",
    now: 3_110,
  })).resolves.toBe(false);
  await expect(outbox.markTelegramDeliverySent({
    id: queued.id,
    leaseToken: "new-lease",
    providerMessageId: "77",
    now: 3_120,
  })).resolves.toBe(true);
  expect(await stored(queued.id)).toEqual(expect.objectContaining({
    status: "sent",
    provider_message_id: "77",
  }));
});
