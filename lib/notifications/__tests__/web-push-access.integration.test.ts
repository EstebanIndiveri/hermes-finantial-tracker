import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("web push subscription ownership", () => {
  let client: Client;
  let directory: string;

  beforeEach(async () => {
    jest.resetModules();
    directory = mkdtempSync(join(tmpdir(), "hermes-push-access-"));
    client = createClient({ url: `file:${join(directory, "push.db")}` });
    await client.executeMultiple(`
      CREATE TABLE push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh_key TEXT NOT NULL,
        auth_key TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key)
        VALUES ('a', 'user-a', 'https://example.test/a', 'key-a', 'auth-a');
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key)
        VALUES ('b', 'user-b', 'https://example.test/b', 'key-b', 'auth-b');
    `);
    jest.doMock("@/lib/db/client", () => ({ db: drizzle(client) }));
    jest.doMock("web-push", () => ({
      __esModule: true,
      default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
    }));
  });

  afterEach(() => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
    jest.dontMock("@/lib/db/client");
    jest.dontMock("web-push");
  });

  it("does not delete another user's endpoint and deletes the owner's endpoint", async () => {
    const { removeSubscription } = await import("../web-push");

    await removeSubscription("user-a", "https://example.test/b");
    const foreign = await client.execute("SELECT id FROM push_subscriptions WHERE id = 'b'");
    expect(foreign.rows).toHaveLength(1);

    await removeSubscription("user-a", "https://example.test/a");
    const own = await client.execute("SELECT id FROM push_subscriptions WHERE id = 'a'");
    expect(own.rows).toHaveLength(0);
  });

  it("reports ownership only for exactly one endpoint belonging to the current user", async () => {
    const { isSubscriptionOwnedByUser } = await import("../web-push");

    await expect(isSubscriptionOwnedByUser("user-a", "https://example.test/a")).resolves.toBe(true);
    await expect(isSubscriptionOwnedByUser("user-b", "https://example.test/a")).resolves.toBe(false);
    await expect(isSubscriptionOwnedByUser("user-a", "https://example.test/missing")).resolves.toBe(false);

    await client.execute(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key)
      VALUES ('duplicate', 'user-b', 'https://example.test/a', 'key', 'auth')`);
    await expect(isSubscriptionOwnedByUser("user-a", "https://example.test/a")).resolves.toBe(false);
  });

  it("does not create two rows for concurrent subscriptions to one browser endpoint", async () => {
    await client.execute("CREATE UNIQUE INDEX push_subscriptions_endpoint_idx ON push_subscriptions(endpoint)");
    const { saveSubscription } = await import("../web-push");
    const endpoint = "https://example.test/concurrent";
    const outcomes = await Promise.allSettled([
      saveSubscription("user-a", { endpoint, keys: { p256dh: "a", auth: "a" } }),
      saveSubscription("user-b", { endpoint, keys: { p256dh: "b", auth: "b" } }),
    ]);
    expect(outcomes.some((result) => result.status === "fulfilled")).toBe(true);
    const rows = await client.execute({
      sql: "SELECT user_id FROM push_subscriptions WHERE endpoint = ?",
      args: [endpoint],
    });
    expect(rows.rows).toHaveLength(1);
    expect(["user-a", "user-b"]).toContain(rows.rows[0].user_id);
  });
});
