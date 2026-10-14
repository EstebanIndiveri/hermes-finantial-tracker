import { isBetaRuntime } from "@/lib/notifications/daily-summary-canary";

const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

export type RecurringReminderScope =
  | { mode: "off" }
  | { mode: "global" }
  | { mode: "canary"; userId: string; groupId: string };

/** A beta-only exception for one recurring-reminder recipient and group. */
export function getRecurringReminderScope(env: NodeJS.ProcessEnv = process.env): RecurringReminderScope {
  const configured = [
    env.RECURRING_REMINDER_CANARY_ENABLED,
    env.RECURRING_REMINDER_CANARY_USER_ID,
    env.RECURRING_REMINDER_CANARY_GROUP_ID,
  ].some((value) => value !== undefined);
  if (env.NOTIFICATIONS_ENABLED === "true") {
    return configured ? { mode: "off" } : { mode: "global" };
  }
  if (env.NOTIFICATIONS_ENABLED !== "false" || env.RECURRING_REMINDER_CANARY_ENABLED !== "true") {
    return { mode: "off" };
  }
  const userId = env.RECURRING_REMINDER_CANARY_USER_ID ?? "";
  const groupId = env.RECURRING_REMINDER_CANARY_GROUP_ID ?? "";
  if (!IDENTIFIER.test(userId) || !IDENTIFIER.test(groupId) || !isBetaRuntime(env)) return { mode: "off" };
  return { mode: "canary", userId, groupId };
}

export function isRecurringReminderRecipientAllowed(
  userId: string,
  groupId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const scope = getRecurringReminderScope(env);
  return scope.mode === "global" ||
    (scope.mode === "canary" && scope.userId === userId && scope.groupId === groupId);
}
