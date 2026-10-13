import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

let client: Client;
let database: ReturnType<typeof drizzle<typeof schema>>;
let outbox: typeof import("../push-outbox");
let temporaryDirectory: string;

const input = (deliveryKey = "delivery-1", now = 1_000) => ({
  id: `id-${deliveryKey}`,
  operationId: "operation-1",
  deliveryKey,
  eventType: "reimbursement.requested" as const,
  reimbursementId: "reimbursement-1",
  userId: "user-1",
  subscriptionId: "subscription-1",
  now,
});

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-push-outbox-"));
  client = createClient({ url: `file:${join(temporaryDirectory, "hermes.db")}`, timeout: 0 });
  await client.executeMultiple(readFileSync(join(process.cwd(), "lib/db/migrations/0012_push_delivery_outbox.sql"), "utf8"));
  database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  outbox = await import("../push-outbox");
});

afterAll(() => {
  client.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
});

afterEach(async () => {
  await client.execute("DELETE FROM push_delivery_outbox");
});

it("builds bounded metadata with the 24-hour expiry and 7-day retention", () => {
  const row = outbox.buildPushDeliveryRow(input());
  expect(row.expiresAt).toBe(1_000 + 24 * 60 * 60 * 1_000);
  expect(row.retentionUntil).toBe(1_000 + 7 * 24 * 60 * 60 * 1_000);
  expect(row).not.toHaveProperty("payload");
  expect(row).not.toHaveProperty("endpoint");
});

it("enqueues idempotently in the caller transaction and fences stale workers", async () => {
  const first = await database.transaction((tx) => outbox.enqueuePushDelivery(tx, input("same-key")));
  const second = await database.transaction((tx) => outbox.enqueuePushDelivery(tx, { ...input("same-key"), id: "other-id" }));
  expect(second.id).toBe(first.id);

  const claimed = await outbox.claimPushDelivery({ now: 1_000, leaseToken: "lease-a" });
  expect(claimed?.leaseToken).toBe("lease-a");
  await expect(outbox.markPushDeliverySent({ id: first.id, leaseToken: "stale", now: 2_000 })).resolves.toBe(false);
  await expect(outbox.markPushDeliverySent({ id: first.id, leaseToken: "lease-a", now: 2_000 })).resolves.toBe(true);
});

it("rejects a delivery-key collision whose identity differs", async () => {
  await database.transaction((tx) => outbox.enqueuePushDelivery(tx, input("collision")));
  await expect(database.transaction((tx) => outbox.enqueuePushDelivery(tx, {
    ...input("collision"), userId: "other-user",
  }))).rejects.toThrow("collision");
});

it("rolls back an enqueue with the caller transaction", async () => {
  await expect(database.transaction(async (tx) => {
    await outbox.enqueuePushDelivery(tx, input("rollback"));
    throw new Error("abort transaction");
  })).rejects.toThrow("abort transaction");
  const count = await client.execute("SELECT COUNT(*) AS count FROM push_delivery_outbox");
  expect(Number(count.rows[0].count)).toBe(0);
});

it("recovers an expired lease and bounds retention purge", async () => {
  const queued = await database.transaction((tx) => outbox.enqueuePushDelivery(tx, input("lease-expired")));
  await expect(outbox.claimPushDelivery({ now: 1_000, leaseMs: 10, leaseToken: "lease-old" })).resolves.toBeTruthy();
  const recovered = await outbox.claimPushDelivery({ now: 1_011, leaseToken: "lease-new" });
  expect(recovered?.leaseToken).toBe("lease-new");
  await outbox.markPushDeliveryDead({ id: queued.id, leaseToken: "lease-new", errorCode: "gone", now: 1_012 });
  expect(await outbox.purgeExpiredPushDeliveries({ now: 1_012 + 7 * 24 * 60 * 60 * 1_000, limit: 1 })).toBe(1);
});

it("sweeps expired non-terminal rows and allows only one concurrent claim", async () => {
  await database.transaction((tx) => outbox.enqueuePushDelivery(tx, input("concurrent")));
  const claims = await Promise.all([
    outbox.claimPushDelivery({ now: 1_000, leaseToken: "worker-a" }),
    outbox.claimPushDelivery({ now: 1_000, leaseToken: "worker-b" }),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);

  await database.transaction((tx) => outbox.enqueuePushDelivery(tx, input("expired", 0)));
  expect(await outbox.sweepExpiredPushDeliveries({ now: 24 * 60 * 60 * 1_000, limit: 1 })).toBe(1);
  const row = await client.execute("SELECT status, last_error_code FROM push_delivery_outbox WHERE delivery_key = 'expired'");
  expect(row.rows[0]).toMatchObject({ status: "dead", last_error_code: "expired" });
});

it("drains a concurrent backlog through a rate-limit retry without duplicate claims", async () => {
  const deliveryCount = 40;
  for (let index = 0; index < deliveryCount; index += 1) {
    await database.transaction((tx) => outbox.enqueuePushDelivery(tx, {
      ...input(`load-${index}`, 100_000),
      operationId: `load-operation-${index}`,
      reimbursementId: `load-reimbursement-${index}`,
      userId: `load-user-${index}`,
      subscriptionId: `load-subscription-${index}`,
    }));
  }

  async function countStatus(status: "retryable" | "sent"): Promise<number> {
    const rows = await client.execute({
      sql: "SELECT COUNT(*) AS count FROM push_delivery_outbox WHERE delivery_key LIKE 'load-%' AND status = ?",
      args: [status],
    });
    return Number(rows.rows[0].count);
  }

  async function drainPhase(phase: "retryable" | "sent", now: number): Promise<void> {
    const claimedIds: string[] = [];
    for (let round = 0; round < deliveryCount && await countStatus(phase) < deliveryCount; round += 1) {
      const batches = await Promise.all(Array.from({ length: 4 }, async (_, worker) => {
        const ids: string[] = [];
        for (let slot = 0; slot < 5; slot += 1) {
          const leaseToken = `${phase}-${round}-${worker}-${slot}`;
          const row = await outbox.claimPushDelivery({ now, leaseToken });
          if (!row) break;
          ids.push(row.id);
          const changed = phase === "retryable"
            ? await outbox.markPushDeliveryRetryable({
              id: row.id,
              leaseToken,
              errorCode: "provider_rate_limited",
              httpStatus: 429,
              retryAt: now + 1_000,
              now,
            })
            : await outbox.markPushDeliverySent({ id: row.id, leaseToken, now });
          expect(changed).toBe(true);
        }
        return ids;
      }));
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(5);
        claimedIds.push(...batch);
      }
    }
    expect(await countStatus(phase)).toBe(deliveryCount);
    expect(claimedIds).toHaveLength(deliveryCount);
    expect(new Set(claimedIds).size).toBe(deliveryCount);
  }

  await drainPhase("retryable", 100_000);
  await drainPhase("sent", 101_000);
  const counts = await client.execute("SELECT MIN(attempt_count) AS minimum, MAX(attempt_count) AS maximum FROM push_delivery_outbox WHERE delivery_key LIKE 'load-%'");
  expect(counts.rows[0]).toEqual(expect.objectContaining({ minimum: 2, maximum: 2 }));
});
