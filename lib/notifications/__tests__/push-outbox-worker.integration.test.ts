import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

const deliveryCount = 40;
const providerCalls = new Map<string, number>();
const sendNotification = jest.fn(async (subscription: { endpoint: string }) => {
  const count = (providerCalls.get(subscription.endpoint) ?? 0) + 1;
  providerCalls.set(subscription.endpoint, count);
  if (count === 1) throw { statusCode: 429 };
});
const setVapidDetails = jest.fn();

let client: Client;
let directory: string;
let database: ReturnType<typeof drizzle<typeof schema>>;
let outbox: typeof import("../push-outbox");
let processPushOutbox: typeof import("../push-outbox-worker").processPushOutbox;
const originalEnv = process.env;

beforeAll(async () => {
  process.env = {
    ...originalEnv,
    WEB_PUSH_ENABLED: "true",
    NOTIFICATIONS_ENABLED: "false",
    WEB_PUSH_CANARY_GROUP_ID: "synthetic-group",
    WEB_PUSH_CANARY_USER_IDS: "synthetic-payer,synthetic-owner",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "synthetic-public-key",
    VAPID_PRIVATE_KEY: "synthetic-private-key",
  };
  directory = mkdtempSync(join(tmpdir(), "hermes-push-worker-load-"));
  client = createClient({ url: `file:${join(directory, "load.db")}`, timeout: 0 });
  await client.executeMultiple(readFileSync(join(process.cwd(), "lib/db/migrations/0012_push_delivery_outbox.sql"), "utf8"));
  await client.executeMultiple(`
    CREATE TABLE transactions (id TEXT PRIMARY KEY, group_id TEXT, status TEXT NOT NULL, deleted_at INTEGER);
    CREATE TABLE reimbursement_requests (id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, status TEXT NOT NULL, requester_id TEXT NOT NULL, payer_id TEXT);
    CREATE TABLE group_members (group_id TEXT NOT NULL, user_id TEXT NOT NULL);
    CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL, p256dh_key TEXT NOT NULL, auth_key TEXT NOT NULL);
    INSERT INTO group_members (group_id, user_id) VALUES ('synthetic-group', 'synthetic-payer');
  `);
  database = drizzle(client, { schema });
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  jest.doMock("web-push", () => ({ __esModule: true, default: { sendNotification, setVapidDetails } }));
  outbox = await import("../push-outbox");
  ({ processPushOutbox } = await import("../push-outbox-worker"));
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
  jest.dontMock("web-push");
  process.env = originalEnv;
});

it("retries a concurrent Push backlog after provider 429 and confirms one success per subscription", async () => {
  for (let index = 0; index < deliveryCount; index += 1) {
    await client.execute({
      sql: "INSERT INTO transactions (id, group_id, status, deleted_at) VALUES (?, ?, ?, NULL)",
      args: [`synthetic-tx-${index}`, "synthetic-group", "active"],
    });
    await client.execute({
      sql: "INSERT INTO reimbursement_requests (id, transaction_id, status, requester_id, payer_id) VALUES (?, ?, ?, ?, ?)",
      args: [`synthetic-reimbursement-${index}`, `synthetic-tx-${index}`, "pending", "synthetic-owner", "synthetic-payer"],
    });
    await client.execute({
      sql: "INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key) VALUES (?, ?, ?, ?, ?)",
      args: [`synthetic-subscription-${index}`, "synthetic-payer", `https://push.example.invalid/${index}`, "synthetic-key", "synthetic-auth"],
    });
    await database.transaction((tx) => outbox.enqueuePushDelivery(tx, {
      id: `synthetic-delivery-${index}`,
      operationId: `synthetic-operation-${index}`,
      deliveryKey: `synthetic-delivery-key-${index}`,
      eventType: "reimbursement.requested",
      reimbursementId: `synthetic-reimbursement-${index}`,
      userId: "synthetic-payer",
      subscriptionId: `synthetic-subscription-${index}`,
      now: 100_000,
    }));
  }

  async function statusCount(status: "retryable" | "sent"): Promise<number> {
    const result = await client.execute({
      sql: "SELECT COUNT(*) AS count FROM push_delivery_outbox WHERE status = ?",
      args: [status],
    });
    return Number(result.rows[0].count);
  }

  async function financialCounts() {
    const result = await client.execute(`SELECT
      (SELECT COUNT(*) FROM transactions) AS transactions,
      (SELECT COUNT(*) FROM reimbursement_requests) AS reimbursements`);
    return result.rows[0];
  }
  const beforeWorker = await financialCounts();

  async function drain(status: "retryable" | "sent", now: number): Promise<void> {
    let claimed = 0;
    for (let round = 0; round < deliveryCount && await statusCount(status) < deliveryCount; round += 1) {
      const results = await Promise.all(Array.from({ length: 4 }, () => processPushOutbox({
        maxClaims: 5,
        maxRuntimeMs: 10_000,
        now: () => now,
        monotonicNow: () => 0,
      })));
      for (const result of results) {
        expect(result.claimed).toBeLessThanOrEqual(5);
        expect(result.dead).toBe(0);
        expect(result.lostLease).toBe(0);
        expect(result.budgetExhausted).toBe(false);
        expect(result[status === "retryable" ? "retried" : "sent"]).toBe(result.claimed);
        claimed += result.claimed;
      }
    }
    expect(await statusCount(status)).toBe(deliveryCount);
    expect(claimed).toBe(deliveryCount);
  }

  await drain("retryable", 100_000);
  const retried = await client.execute("SELECT status, attempt_count, next_attempt_at, last_http_status FROM push_delivery_outbox");
  expect(retried.rows).toHaveLength(deliveryCount);
  for (const row of retried.rows) {
    expect(row).toMatchObject({ status: "retryable", attempt_count: 1, next_attempt_at: 160_000, last_http_status: 429 });
  }
  expect([...providerCalls.values()]).toEqual(Array(deliveryCount).fill(1));
  const premature = await processPushOutbox({ maxClaims: 5, now: () => 159_999, monotonicNow: () => 0 });
  expect(premature.claimed).toBe(0);
  expect(sendNotification).toHaveBeenCalledTimes(deliveryCount);
  await drain("sent", 160_000);
  expect(sendNotification).toHaveBeenCalledTimes(deliveryCount * 2);
  expect([...providerCalls.values()]).toEqual(Array(deliveryCount).fill(2));
  expect([...providerCalls.keys()].sort()).toEqual(
    Array.from({ length: deliveryCount }, (_, index) => `https://push.example.invalid/${index}`).sort(),
  );
  const final = await client.execute(`SELECT status, attempt_count, last_http_status, lease_token, lease_expires_at
    FROM push_delivery_outbox`);
  expect(final.rows).toHaveLength(deliveryCount);
  for (const row of final.rows) {
    expect(row).toMatchObject({ status: "sent", attempt_count: 2, last_http_status: null, lease_token: null, lease_expires_at: null });
  }
  expect(beforeWorker).toMatchObject({ transactions: deliveryCount, reimbursements: deliveryCount });
  expect(await financialCounts()).toEqual(beforeWorker);

  await client.execute("INSERT INTO transactions (id, group_id, status, deleted_at) VALUES ('nonmember-tx', 'synthetic-group', 'active', NULL)");
  await client.execute("INSERT INTO reimbursement_requests (id, transaction_id, status, requester_id, payer_id) VALUES ('nonmember-reimbursement', 'nonmember-tx', 'pending', 'synthetic-payer', 'synthetic-owner')");
  await client.execute("INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key) VALUES ('nonmember-subscription', 'synthetic-owner', 'https://push.example.invalid/nonmember', 'synthetic-key', 'synthetic-auth')");
  await database.transaction((tx) => outbox.enqueuePushDelivery(tx, {
    id: "nonmember-delivery",
    operationId: "nonmember-operation",
    deliveryKey: "nonmember-key",
    eventType: "reimbursement.requested",
    reimbursementId: "nonmember-reimbursement",
    userId: "synthetic-owner",
    subscriptionId: "nonmember-subscription",
    now: 200_000,
  }));
  const fenced = await processPushOutbox({ maxClaims: 1, now: () => 200_000, monotonicNow: () => 0 });
  expect(fenced).toEqual(expect.objectContaining({ claimed: 1, dead: 1, sent: 0, lostLease: 0 }));
  expect(sendNotification).toHaveBeenCalledTimes(deliveryCount * 2);
  const denied = await client.execute("SELECT status, last_error_code FROM push_delivery_outbox WHERE id = 'nonmember-delivery'");
  expect(denied.rows[0]).toMatchObject({ status: "dead", last_error_code: "ineligible" });
});
