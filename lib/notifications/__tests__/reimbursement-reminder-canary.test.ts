import { getReimbursementReminderScope, isReimbursementReminderRecipientAllowed } from "../reimbursement-reminder-canary";

describe("reimbursement reminder beta scope", () => {
  const payerId = "payer-beta-1";
  const groupId = "group-beta-1";
  const canary = {
    NOTIFICATIONS_ENABLED: "false",
    HERMES_BETA_ISOLATION_ASSERT: "true",
    NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
    TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
    TELEGRAM_BOT_ID: "8739389202",
    REIMBURSEMENT_REMINDER_CANARY_ENABLED: "true",
    REIMBURSEMENT_REMINDER_CANARY_PAYER_ID: payerId,
    REIMBURSEMENT_REMINDER_CANARY_GROUP_ID: groupId,
  } as NodeJS.ProcessEnv;

  it("allows only the configured payer and source group in beta", () => {
    expect(getReimbursementReminderScope(canary)).toEqual({ mode: "canary", payerId, groupId });
    expect(isReimbursementReminderRecipientAllowed(payerId, groupId, canary)).toBe(true);
    expect(isReimbursementReminderRecipientAllowed("other", groupId, canary)).toBe(false);
    expect(isReimbursementReminderRecipientAllowed(payerId, "other", canary)).toBe(false);
  });

  it.each([
    { ...canary, REIMBURSEMENT_REMINDER_CANARY_ENABLED: "false" },
    { ...canary, REIMBURSEMENT_REMINDER_CANARY_ENABLED: "True" },
    { ...canary, REIMBURSEMENT_REMINDER_CANARY_PAYER_ID: "" },
    { ...canary, REIMBURSEMENT_REMINDER_CANARY_GROUP_ID: "" },
    { ...canary, HERMES_BETA_ISOLATION_ASSERT: undefined },
    { ...canary, NEXT_PUBLIC_APP_URL: "https://legacy.example.com" },
    { ...canary, TURSO_DATABASE_URL: "libsql://legacy.example.com" },
    { ...canary, TELEGRAM_BOT_ID: "other-bot" },
    { ...canary, NOTIFICATIONS_ENABLED: "true" },
  ])("fails closed for partial or mismatched settings %#", (env) => {
    expect(getReimbursementReminderScope(env as NodeJS.ProcessEnv)).toEqual({ mode: "off" });
  });

  it("preserves global mode only when no reimbursement canary binding exists", () => {
    expect(getReimbursementReminderScope({ NOTIFICATIONS_ENABLED: "true" })).toEqual({ mode: "global" });
    expect(getReimbursementReminderScope({
      NOTIFICATIONS_ENABLED: "true",
      REIMBURSEMENT_REMINDER_CANARY_ENABLED: "false",
    })).toEqual({ mode: "off" });
    expect(getReimbursementReminderScope({ NOTIFICATIONS_ENABLED: "false" })).toEqual({ mode: "off" });
  });
});
