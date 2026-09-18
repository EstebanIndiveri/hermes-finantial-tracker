import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getGroupMembership, getPersonalGroup } from "@/lib/groups/permissions";

/** Resolves a Telegram user's active group only when membership is current. */
export async function resolveAuthorizedTelegramGroup(
  userId: string,
  activeGroupId: string | null | undefined,
): Promise<string | null> {
  if (!activeGroupId) return getPersonalGroup(userId);

  const membership = await getGroupMembership(userId, activeGroupId);
  if (membership) return activeGroupId;

  await db
    .update(users)
    .set({ active_telegram_group_id: null })
    .where(and(eq(users.id, userId), eq(users.active_telegram_group_id, activeGroupId)));

  return getPersonalGroup(userId);
}
