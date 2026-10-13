import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("proactive consent belongs to one account", () => {
  let client: Client;
  let directory: string;

  beforeEach(async () => {
    jest.resetModules();
    directory = mkdtempSync(join(tmpdir(), "hermes-proactive-consent-"));
    client = createClient({ url: `file:${join(directory, "consent.db")}` });
    await client.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id TEXT PRIMARY KEY);
      INSERT INTO users (id) VALUES ('user-a'), ('user-b');
      CREATE TABLE notification_preferences (
        user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        daily_summary INTEGER NOT NULL DEFAULT 0,
        recurring INTEGER NOT NULL DEFAULT 0,
        reimbursements INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        CONSTRAINT notification_preferences_daily_summary_check CHECK (daily_summary IN (0, 1)),
        CONSTRAINT notification_preferences_recurring_check CHECK (recurring IN (0, 1)),
        CONSTRAINT notification_preferences_reimbursements_check CHECK (reimbursements IN (0, 1))
      );
    `);
    jest.doMock("@/lib/db/client", () => ({ db: drizzle(client) }));
  });

  afterEach(() => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
    jest.dontMock("@/lib/db/client");
  });

  it("keeps opt-ins and revocations independent across accounts", async () => {
    const { getProactivePreferences, hasProactiveConsent, setProactivePreference } = await import("../proactive-consent");

    expect(await getProactivePreferences("user-a")).toEqual({
      dailySummary: false, recurring: false, reimbursements: false,
    });
    expect(await getProactivePreferences("user-b")).toEqual({
      dailySummary: false, recurring: false, reimbursements: false,
    });

    await setProactivePreference("user-a", "dailySummary", true);
    await setProactivePreference("user-b", "recurring", true);
    expect(await hasProactiveConsent("user-a", "dailySummary")).toBe(true);
    expect(await hasProactiveConsent("user-a", "recurring")).toBe(false);
    expect(await hasProactiveConsent("user-b", "dailySummary")).toBe(false);
    expect(await hasProactiveConsent("user-b", "recurring")).toBe(true);

    await setProactivePreference("user-a", "dailySummary", false);
    expect(await getProactivePreferences("user-a")).toEqual({
      dailySummary: false, recurring: false, reimbursements: false,
    });
    expect(await getProactivePreferences("user-b")).toEqual({
      dailySummary: false, recurring: true, reimbursements: false,
    });
    const rows = await client.execute("SELECT user_id FROM notification_preferences ORDER BY user_id");
    expect(rows.rows.map((row) => row.user_id)).toEqual(["user-a", "user-b"]);
  });
});
