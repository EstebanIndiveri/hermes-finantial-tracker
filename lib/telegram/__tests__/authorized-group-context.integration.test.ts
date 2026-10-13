import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/lib/db/schema";

describe("proactive group resolution across accounts", () => {
  let client: Client;
  let directory: string;

  beforeEach(async () => {
    jest.resetModules();
    directory = mkdtempSync(join(tmpdir(), "hermes-group-context-"));
    client = createClient({ url: `file:${join(directory, "groups.db")}` });
    await client.executeMultiple(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT NOT NULL DEFAULT '',
        telegram_user_id TEXT UNIQUE,
        active_telegram_group_id TEXT,
        personal_token_hash TEXT,
        onboarding_completed_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      CREATE TABLE group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        joined_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      );
      INSERT INTO users (id, name, username, telegram_user_id, active_telegram_group_id) VALUES
        ('user-a', 'A', 'a', 'telegram-a', 'group-a'),
        ('user-b', 'B', 'b', 'telegram-b', 'group-a');
      INSERT INTO group_members (group_id, user_id, role) VALUES
        ('group-a', 'user-a', 'owner'),
        ('group-b', 'user-b', 'owner');
    `);
    jest.doMock("@/lib/db/client", () => ({ db: drizzle(client, { schema }) }));
  });

  afterEach(() => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
    jest.dontMock("@/lib/db/client");
  });

  it("never resolves a removed member's stale pointer to the former owner's group", async () => {
    const { resolveAuthorizedTelegramGroup } = await import("../authorized-group-context");

    expect(await resolveAuthorizedTelegramGroup("user-a", "group-a")).toBe("group-a");
    expect(await resolveAuthorizedTelegramGroup("user-b", "group-a")).toBe("group-b");
    const state = await client.execute("SELECT active_telegram_group_id FROM users WHERE id = 'user-b'");
    expect(state.rows[0].active_telegram_group_id).toBeNull();
    expect(await resolveAuthorizedTelegramGroup("user-b", null)).toBe("group-b");
  });
});
