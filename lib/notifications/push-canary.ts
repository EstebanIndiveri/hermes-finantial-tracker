/** Beta-only delivery fence. A missing or malformed scope never allows a send. */
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

function canaryScope(): { groupId: string; userIds: Set<string> } | null {
  const groupId = process.env.WEB_PUSH_CANARY_GROUP_ID?.trim() ?? "";
  const rawUsers = process.env.WEB_PUSH_CANARY_USER_IDS ?? "";
  const userIds = rawUsers.split(",").map((value) => value.trim());
  if (!IDENTIFIER.test(groupId) || userIds.length !== 2 ||
      userIds.some((value) => !IDENTIFIER.test(value)) ||
      new Set(userIds).size !== 2) return null;
  return { groupId, userIds: new Set(userIds) };
}

export function isPushCanaryConfigured(): boolean {
  return canaryScope() !== null;
}

/** Explicit scoped exception to the beta's broad notifications-off policy. */
export function isPushCanaryEnabled(): boolean {
  return process.env.WEB_PUSH_ENABLED === "true" &&
    process.env.NOTIFICATIONS_ENABLED === "false" && isPushCanaryConfigured();
}

export function isPushCanaryTarget(
  groupId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  const scope = canaryScope();
  return Boolean(scope && groupId === scope.groupId && userId && scope.userIds.has(userId));
}
