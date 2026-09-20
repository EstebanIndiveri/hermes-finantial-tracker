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

it("purges only expired terminal deliveries and respects the batch limit", async () => {
  await client.execute({
    sql: `INSERT INTO telegram_operations
      (operation_id, bot_id, update_id, operation_kind, status)
      VALUES (?, ?, ?, ?, ?)`,
    args: ["operation-bot-2", "bot-2", "update-bot-2", "outbox.test", "committed"],
  });
  const otherBotExpired = await outbox.enqueueTelegramDelivery({
    ...input("purge-other-bot"),
    botId: "bot-2",
    updateId: "update-bot-2",
    operationId: "operation-bot-2",
    retentionMs: 1,
  });
  const otherBotClaim = await outbox.claimTelegramDelivery({
    id: otherBotExpired.id,
    botId: "bot-2",
    now: 2_000,
    leaseToken: "purge-other-bot-lease",
  });
  await outbox.markTelegramDeliverySent({
    id: otherBotExpired.id,
    leaseToken: otherBotClaim!.lease_token!,
    now: 2_001,
  });

  const sentExpired = await outbox.enqueueTelegramDelivery({
    ...input("purge-sent-expired"),
    retentionMs: 1,
  });
  const sentClaim = await outbox.claimTelegramDelivery({
    id: sentExpired.id,
    now: 2_000,
    leaseToken: "purge-sent-lease",
  });
  await outbox.markTelegramDeliverySent({
    id: sentExpired.id,
    leaseToken: sentClaim!.lease_token!,
    now: 2_001,
  });

  const deadExpired = await outbox.enqueueTelegramDelivery({
    ...input("purge-dead-expired"),
    retentionMs: 1,
  });
  const deadClaim = await outbox.claimTelegramDelivery({
    id: deadExpired.id,
    now: 2_000,
    leaseToken: "purge-dead-lease",
  });
  await outbox.markTelegramDeliveryDead({
    id: deadExpired.id,
    leaseToken: deadClaim!.lease_token!,
    errorCode: "provider_rejected",
    now: 2_001,
  });

  const pendingExpired = await outbox.enqueueTelegramDelivery({
    ...input("purge-pending-expired"),
    retentionMs: 1,
  });
  const retryableExpired = await outbox.enqueueTelegramDelivery({
    ...input("purge-retryable-expired"),
    retentionMs: 1,
  });
  const retryClaim = await outbox.claimTelegramDelivery({
    id: retryableExpired.id,
    now: 2_000,
    leaseToken: "purge-retry-lease",
  });
  await outbox.markTelegramDeliveryRetryable({
    id: retryableExpired.id,
    leaseToken: retryClaim!.lease_token!,
    errorCode: "network_error",
    retryAt: 10_000,
    now: 2_001,
  });

  const processingExpired = await outbox.enqueueTelegramDelivery({
    ...input("purge-processing-expired"),
    retentionMs: 1,
  });
  await outbox.claimTelegramDelivery({
    id: processingExpired.id,
    now: 2_000,
    leaseToken: "purge-processing-lease",
    leaseMs: 100_000,
  });

  const sentRetained = await outbox.enqueueTelegramDelivery({
    ...input("purge-sent-retained"),
    retentionMs: 100_000,
  });
  const retainedClaim = await outbox.claimTelegramDelivery({
    id: sentRetained.id,
    now: 2_000,
    leaseToken: "purge-retained-lease",
  });
  await outbox.markTelegramDeliverySent({
    id: sentRetained.id,
    leaseToken: retainedClaim!.lease_token!,
    now: 2_001,
  });

  await expect(outbox.purgeExpiredTelegramDeliveries({ botId: "bot-1", now: 2_000, limit: 1 })).resolves.toBe(1);
  await expect(outbox.purgeExpiredTelegramDeliveries({ botId: "bot-1", now: 2_000, limit: 100 })).resolves.toBe(1);

  const remaining = await client.execute({
    sql: `SELECT id, status FROM telegram_delivery_outbox
      WHERE id IN (?, ?, ?, ?, ?)` ,
    args: [
      pendingExpired.id,
      retryableExpired.id,
      processingExpired.id,
      sentRetained.id,
      sentExpired.id,
    ],
  });
  expect(remaining.rows).toEqual(expect.arrayContaining([
    { id: pendingExpired.id, status: "pending" },
    { id: retryableExpired.id, status: "retryable" },
    { id: processingExpired.id, status: "processing" },
    { id: sentRetained.id, status: "sent" },
  ]));
  expect(remaining.rows).not.toEqual(expect.arrayContaining([
    { id: sentExpired.id, status: "sent" },
    { id: deadExpired.id, status: "dead" },
  ]));

  const otherBot = await client.execute({
    sql: "SELECT status FROM telegram_delivery_outbox WHERE id = ?",
    args: [otherBotExpired.id],
  });
  expect(otherBot.rows).toEqual([{ status: "sent" }]);
});
