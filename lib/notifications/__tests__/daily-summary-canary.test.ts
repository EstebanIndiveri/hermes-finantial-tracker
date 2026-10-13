import { getDailySummaryScope, isDailySummaryRecipientAllowed } from "../daily-summary-canary";

describe("daily summary beta scope", () => {
  const userId = "user-beta-1";
  const groupId = "group-beta-1";
  const canary = {
    NOTIFICATIONS_ENABLED: "false",
    HERMES_BETA_ISOLATION_ASSERT: "true",
    NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
    TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
    TELEGRAM_BOT_ID: "8739389202",
    DAILY_SUMMARY_CANARY_ENABLED: "true",
    DAILY_SUMMARY_CANARY_USER_ID: userId,
    DAILY_SUMMARY_CANARY_GROUP_ID: groupId,
  } as NodeJS.ProcessEnv;

  it("allows only the exact user and group with the global switch off", () => {
    expect(getDailySummaryScope(canary)).toEqual({ mode: "canary", userId, groupId });
    expect(isDailySummaryRecipientAllowed(userId, groupId, canary)).toBe(true);
    expect(isDailySummaryRecipientAllowed("user-beta-2", groupId, canary)).toBe(false);
    expect(isDailySummaryRecipientAllowed(userId, "group-beta-2", canary)).toBe(false);
  });

  it.each([
    { ...canary, DAILY_SUMMARY_CANARY_ENABLED: "false" },
    { ...canary, DAILY_SUMMARY_CANARY_ENABLED: "True" },
    { ...canary, DAILY_SUMMARY_CANARY_USER_ID: "" },
    { ...canary, DAILY_SUMMARY_CANARY_GROUP_ID: "" },
    { ...canary, DAILY_SUMMARY_CANARY_USER_ID: "group beta" },
    { ...canary, NOTIFICATIONS_ENABLED: "missing" },
    { ...canary, NOTIFICATIONS_ENABLED: undefined },
    { ...canary, HERMES_BETA_ISOLATION_ASSERT: undefined },
    { ...canary, NEXT_PUBLIC_APP_URL: "https://legacy.example.com" },
    { ...canary, TURSO_DATABASE_URL: "libsql://legacy.example.com" },
    { ...canary, TELEGRAM_BOT_ID: "other-bot" },
    { ...canary, NOTIFICATIONS_ENABLED: "true" },
  ])("fails closed for incomplete or invalid canary configuration %#", (env) => {
    expect(getDailySummaryScope(env as NodeJS.ProcessEnv)).toEqual({ mode: "off" });
  });

  it("retains the existing global path only for explicit true", () => {
    expect(getDailySummaryScope({ NOTIFICATIONS_ENABLED: "true" })).toEqual({ mode: "global" });
    expect(isDailySummaryRecipientAllowed("any-user", "any-group", { NOTIFICATIONS_ENABLED: "true" })).toBe(true);
  });
});
