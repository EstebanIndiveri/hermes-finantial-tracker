import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

let client: Client;
let database: ReturnType<typeof drizzle>;
let inbox: typeof import("../update-inbox");
let temporaryDirectory: string;
let updateSequence = 0;

function updateId(prefix: string): string {
  updateSequence += 1;
  return `${prefix}-${updateSequence}`;
}

async function rowFor(botId: string, telegramUpdateId: string) {
  const result = await client.execute({
    sql: `SELECT bot_id, update_id, status, attempt_count, lease_token,
                 lease_expires_at, last_error_code, completed_at
          FROM telegram_update_inbox
          WHERE bot_id = ? AND update_id = ?`,
    args: [botId, telegramUpdateId],
  });
  return result.rows[0];
}

beforeAll(async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hermes-update-inbox-"));
  const databasePath = join(temporaryDirectory, "hermes.db");
  client = createClient({ url: `file:${databasePath}`, timeout: 0 });
  await client.executeMultiple(
    readFileSync(join(process.cwd(), "lib/db/migrations/0009_telegram_update_inbox.sql"), "utf8"),
  );

  database = drizzle(client, { schema });
  // Use a real local libSQL/Drizzle database. Production's client wiring
  // remains untouched.
  jest.resetModules();
  jest.doMock("@/lib/db/client", () => ({ db: database }));
  inbox = await import("../update-inbox");
});

afterAll(() => {
  client.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
  jest.dontMock("@/lib/db/client");
});

describe("Telegram update inbox claims", () => {
  it("gives one owner across ten sequential duplicate claims", async () => {
    const botId = "bot-sequential";
    const telegramUpdateId = updateId("sequential");
    const claims = [];

    for (let index = 0; index < 10; index += 1) {
      claims.push(
        await inbox.claimTelegramUpdate({
          botId,
          updateId: telegramUpdateId,
          updateKind: "message",
          now: 1_000,
          leaseToken: `sequential-token-${index}`,
        }),
      );
    }

    expect(claims.filter((claim) => claim.kind === "acquired")).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === "busy")).toHaveLength(9);
    expect(await rowFor(botId, telegramUpdateId)).toEqual(
      expect.objectContaining({
        status: "processing",
        attempt_count: 1,
        lease_token: "sequential-token-0",
      }),
    );
  });

  it("gives one owner across ten parallel duplicate claims", async () => {
    const botId = "bot-parallel";
    const telegramUpdateId = updateId("parallel");
    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        inbox.claimTelegramUpdate({
          botId,
          updateId: telegramUpdateId,
          updateKind: "callback_query",
          now: 2_000,
          leaseToken: `parallel-token-${index}`,
        }),
      ),
    );

    expect(claims.filter((claim) => claim.kind === "acquired")).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === "busy")).toHaveLength(9);
    const count = await client.execute({
      sql: "SELECT COUNT(*) AS count FROM telegram_update_inbox WHERE bot_id = ? AND update_id = ?",
      args: [botId, telegramUpdateId],
    });
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it("allows the same update id for different bots", async () => {
    const telegramUpdateId = updateId("two-bots");
    const first = await inbox.claimTelegramUpdate({
      botId: "bot-a",
      updateId: telegramUpdateId,
      updateKind: "message",
      now: 3_000,
      leaseToken: "bot-a-token",
    });
    const second = await inbox.claimTelegramUpdate({
      botId: "bot-b",
      updateId: telegramUpdateId,
      updateKind: "message",
      now: 3_000,
      leaseToken: "bot-b-token",
    });

    expect(first.kind).toBe("acquired");
    expect(second.kind).toBe("acquired");
  });

  it("does not reacquire a completed update", async () => {
    const botId = "bot-completed";
    const telegramUpdateId = updateId("completed");
    const first = await inbox.claimTelegramUpdate({
      botId,
      updateId: telegramUpdateId,
      updateKind: "photo",
      now: 4_000,
      leaseToken: "completed-token",
    });
    expect(first.kind).toBe("acquired");

    await expect(
      inbox.completeTelegramUpdate({
        botId,
        updateId: telegramUpdateId,
        leaseToken: "completed-token",
        now: 4_100,
      }),
    ).resolves.toBe(true);

    await expect(
      inbox.claimTelegramUpdate({
        botId,
        updateId: telegramUpdateId,
        updateKind: "photo",
        now: 4_200,
        leaseToken: "new-token",
      }),
    ).resolves.toEqual({ kind: "completed" });
    expect(await rowFor(botId, telegramUpdateId)).toEqual(
      expect.objectContaining({ status: "completed", attempt_count: 1 }),
    );
  });

  it("reclaims an expired lease and fences the old token", async () => {
    const botId = "bot-expired";
    const telegramUpdateId = updateId("expired");
    await expect(
      inbox.claimTelegramUpdate({
        botId,
        updateId: telegramUpdateId,
        updateKind: "voice",
        now: 5_000,
        leaseMs: 100,
        leaseToken: "old-token",
      }),
    ).resolves.toEqual({
      kind: "acquired",
      leaseToken: "old-token",
      attempt: 1,
      leaseExpiresAt: 5_100,
    });

    await expect(
      inbox.claimTelegramUpdate({
        botId,
        updateId: telegramUpdateId,
        updateKind: "voice",
        now: 5_100,
        leaseMs: 100,
        leaseToken: "new-token",
      }),
    ).resolves.toEqual({
      kind: "acquired",
      leaseToken: "new-token",
      attempt: 2,
      leaseExpiresAt: 5_200,
    });

    await expect(
      inbox.completeTelegramUpdate({
        botId,
        updateId: telegramUpdateId,
        leaseToken: "old-token",
        now: 5_110,
      }),
    ).resolves.toBe(false);
    await expect(
      inbox.failTelegramUpdate({
        botId,
        updateId: telegramUpdateId,
        leaseToken: "old-token",
        now: 5_110,
      }),
    ).resolves.toBe(false);
    await expect(
      inbox.completeTelegramUpdate({
        botId,
        updateId: telegramUpdateId,
        leaseToken: "new-token",
        now: 5_120,
      }),
    ).resolves.toBe(true);
  });

  it("returns a retryable row to the next owner and stores only a bounded code", async () => {
    const botId = "bot-retryable";
    const telegramUpdateId = updateId("retryable");
    await inbox.claimTelegramUpdate({
      botId,
      updateId: telegramUpdateId,
      updateKind: "document",
      now: 6_000,
      leaseToken: "retry-token-a",
    });

    await expect(
      inbox.failTelegramUpdate({
        botId,
        updateId: telegramUpdateId,
        leaseToken: "retry-token-a",
        errorCode: "provider timeout: sensitive payload should not persist",
        now: 6_100,
      }),
    ).resolves.toBe(true);
    expect(await rowFor(botId, telegramUpdateId)).toEqual(
      expect.objectContaining({ status: "retryable", last_error_code: "unknown" }),
    );

    await expect(
      inbox.claimTelegramUpdate({
        botId,
        updateId: telegramUpdateId,
        updateKind: "document",
        now: 6_200,
        leaseToken: "retry-token-b",
      }),
    ).resolves.toEqual(expect.objectContaining({
      kind: "acquired",
      leaseToken: "retry-token-b",
      attempt: 2,
    }));
  });
});

describe("resolveTelegramBotId", () => {
  it("prefers an explicit id and never returns the token", () => {
    expect(inbox.resolveTelegramBotId({
      TELEGRAM_BOT_ID: "configured-bot",
      TELEGRAM_BOT_TOKEN: "123456:secret-token",
    })).toBe("configured-bot");
    expect(inbox.resolveTelegramBotId({
      TELEGRAM_BOT_TOKEN: "123456:secret-token",
    })).toBe("123456");
    expect(inbox.resolveTelegramBotId({
      TELEGRAM_BOT_TOKEN: "not-a-token",
    })).toBe("telegram-single-bot");
  });

  it("rejects a token or unsafe value supplied as the explicit bot id", () => {
    expect(() => inbox.resolveTelegramBotId({
      TELEGRAM_BOT_ID: "123456:secret-token",
    })).toThrow("non-secret stable identifier");
    expect(() => inbox.resolveTelegramBotId({
      TELEGRAM_BOT_ID: "bot with spaces",
    })).toThrow("non-secret stable identifier");
  });

  it("fails closed in production without a stable bot identity", () => {
    expect(() => inbox.resolveTelegramBotId({
      NODE_ENV: "production",
      TELEGRAM_BOT_TOKEN: "not-a-token",
    })).toThrow("stable Telegram bot id is required");
  });
});
