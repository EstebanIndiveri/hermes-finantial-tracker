const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const BETA_ORIGIN = "https://hermes-finantial-tracker-z2.vercel.app";
const BETA_DATABASE_HOST = "beta-hermes-esteban-indiveri.aws-us-east-2.turso.io";
const BETA_BOT_ID = "8739389202";

function isBetaRuntime(env: NodeJS.ProcessEnv): boolean {
  if (env.HERMES_BETA_ISOLATION_ASSERT !== "true" ||
    env.NEXT_PUBLIC_APP_URL !== BETA_ORIGIN || env.TELEGRAM_BOT_ID !== BETA_BOT_ID) return false;
  try {
    const database = new URL(env.TURSO_DATABASE_URL ?? "");
    return database.protocol === "libsql:" && database.hostname === BETA_DATABASE_HOST &&
      (database.pathname === "" || database.pathname === "/") && !database.port &&
      !database.username && !database.password && !database.search && !database.hash;
  } catch {
    return false;
  }
}

export type DailySummaryScope =
  | { mode: "off" }
  | { mode: "global" }
  | { mode: "canary"; userId: string; groupId: string };

/** A beta-only one-user/one-group exception while the broad switch is off. */
export function getDailySummaryScope(env: NodeJS.ProcessEnv = process.env): DailySummaryScope {
  // A configured canary may never turn into a broad send after a flag change.
  if (env.NOTIFICATIONS_ENABLED === "true") {
    return env.DAILY_SUMMARY_CANARY_ENABLED === undefined ? { mode: "global" } : { mode: "off" };
  }
  if (env.NOTIFICATIONS_ENABLED !== "false" || env.DAILY_SUMMARY_CANARY_ENABLED !== "true") {
    return { mode: "off" };
  }
  const userId = env.DAILY_SUMMARY_CANARY_USER_ID ?? "";
  const groupId = env.DAILY_SUMMARY_CANARY_GROUP_ID ?? "";
  if (!IDENTIFIER.test(userId) || !IDENTIFIER.test(groupId) || !isBetaRuntime(env)) return { mode: "off" };
  return { mode: "canary", userId, groupId };
}

export function isDailySummaryRecipientAllowed(
  userId: string,
  groupId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const scope = getDailySummaryScope(env);
  return scope.mode === "global" ||
    (scope.mode === "canary" && scope.userId === userId && scope.groupId === groupId);
}
