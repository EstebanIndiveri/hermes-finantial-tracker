import { isBetaRuntime } from "@/lib/notifications/daily-summary-canary";

const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

export type ReimbursementReminderScope =
  | { mode: "off" }
  | { mode: "global" }
  | { mode: "canary"; payerId: string; groupId: string };

/** A beta-only payer/source-group exception, independent of other reminder scopes. */
export function getReimbursementReminderScope(
  env: NodeJS.ProcessEnv = process.env,
): ReimbursementReminderScope {
  const configured = [
    env.REIMBURSEMENT_REMINDER_CANARY_ENABLED,
    env.REIMBURSEMENT_REMINDER_CANARY_PAYER_ID,
    env.REIMBURSEMENT_REMINDER_CANARY_GROUP_ID,
  ].some((value) => value !== undefined);
  if (env.NOTIFICATIONS_ENABLED === "true") {
    return configured ? { mode: "off" } : { mode: "global" };
  }
  if (env.NOTIFICATIONS_ENABLED !== "false" || env.REIMBURSEMENT_REMINDER_CANARY_ENABLED !== "true") {
    return { mode: "off" };
  }
  const payerId = env.REIMBURSEMENT_REMINDER_CANARY_PAYER_ID ?? "";
  const groupId = env.REIMBURSEMENT_REMINDER_CANARY_GROUP_ID ?? "";
  if (!IDENTIFIER.test(payerId) || !IDENTIFIER.test(groupId) || !isBetaRuntime(env)) return { mode: "off" };
  return { mode: "canary", payerId, groupId };
}

export function isReimbursementReminderRecipientAllowed(
  payerId: string,
  groupId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const scope = getReimbursementReminderScope(env);
  return scope.mode === "global" ||
    (scope.mode === "canary" && scope.payerId === payerId && scope.groupId === groupId);
}
