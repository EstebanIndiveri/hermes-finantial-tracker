import { getRecurringReminderScope, isRecurringReminderRecipientAllowed } from "../recurring-reminder-canary";

describe("recurring reminder beta scope", () => {
  const userId = "user-beta-1";
  const groupId = "group-beta-1";
  const canary = {
    NOTIFICATIONS_ENABLED: "false",
    HERMES_BETA_ISOLATION_ASSERT: "true",
    NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
    TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
    TELEGRAM_BOT_ID: "8739389202",
    RECURRING_REMINDER_CANARY_ENABLED: "true",
    RECURRING_REMINDER_CANARY_USER_ID: userId,
    RECURRING_REMINDER_CANARY_GROUP_ID: groupId,
  } as NodeJS.ProcessEnv;

  it("allows only the exact beta user and group", () => {
    expect(getRecurringReminderScope(canary)).toEqual({ mode: "canary", userId, groupId });
    expect(isRecurringReminderRecipientAllowed(userId, groupId, canary)).toBe(true);
    expect(isRecurringReminderRecipientAllowed("other", groupId, canary)).toBe(false);
    expect(isRecurringReminderRecipientAllowed(userId, "other", canary)).toBe(false);
  });

  it.each([
    { ...canary, RECURRING_REMINDER_CANARY_ENABLED: "false" },
    { ...canary, RECURRING_REMINDER_CANARY_ENABLED: "True" },
    { ...canary, RECURRING_REMINDER_CANARY_USER_ID: "" },
    { ...canary, RECURRING_REMINDER_CANARY_GROUP_ID: "" },
    { ...canary, HERMES_BETA_ISOLATION_ASSERT: undefined },
    { ...canary, NEXT_PUBLIC_APP_URL: "https://legacy.example.com" },
    { ...canary, TURSO_DATABASE_URL: "libsql://legacy.example.com" },
    { ...canary, TELEGRAM_BOT_ID: "other-bot" },
    { ...canary, NOTIFICATIONS_ENABLED: "true" },
  ])("fails closed for partial or mismatched configuration %#", (env) => {
    expect(getRecurringReminderScope(env as NodeJS.ProcessEnv)).toEqual({ mode: "off" });
  });

  it("retains global mode only when no recurring canary binding exists", () => {
    expect(getRecurringReminderScope({ NOTIFICATIONS_ENABLED: "true" })).toEqual({ mode: "global" });
    expect(getRecurringReminderScope({ NOTIFICATIONS_ENABLED: "true", RECURRING_REMINDER_CANARY_ENABLED: "false" })).toEqual({ mode: "off" });
    expect(getRecurringReminderScope({ NOTIFICATIONS_ENABLED: "false" })).toEqual({ mode: "off" });
  });
});
