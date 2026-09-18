import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { split_session_members, split_sessions, temp_users, users } from "@/lib/db/schema";

export type AuthorizedSplitResult =
  | {
      ok: true;
      context: {
        session: typeof split_sessions.$inferSelect;
        actor: { kind: "user" | "temp"; id: string };
      };
    }
  | { ok: false; reason: "no_open_session" | "unknown_actor" | "not_member" };

/** Resolves the active session, Telegram identity, and exact session membership. */
export async function resolveAuthorizedSplitContext(
  chatId: string,
  telegramUserId: string,
  expectedSessionId?: string,
): Promise<AuthorizedSplitResult> {
  const conditions = [
    eq(split_sessions.telegram_chat_id, chatId),
    eq(split_sessions.status, "open"),
  ];
  if (expectedSessionId) conditions.push(eq(split_sessions.id, expectedSessionId));

  const session = await db.query.split_sessions.findFirst({ where: and(...conditions) });
  if (!session) return { ok: false, reason: "no_open_session" };

  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });
  const tempUser = hermesUser
    ? null
    : await db.query.temp_users.findFirst({ where: eq(temp_users.telegram_user_id, telegramUserId) });

  if (!hermesUser && !tempUser) return { ok: false, reason: "unknown_actor" };

  const member = await db.query.split_session_members.findFirst({
    where: hermesUser
      ? and(eq(split_session_members.session_id, session.id), eq(split_session_members.user_id, hermesUser.id))
      : and(eq(split_session_members.session_id, session.id), eq(split_session_members.temp_user_id, tempUser!.id)),
  });
  if (!member) return { ok: false, reason: "not_member" };

  return {
    ok: true,
    context: {
      session,
      actor: hermesUser ? { kind: "user", id: hermesUser.id } : { kind: "temp", id: tempUser!.id },
    },
  };
}
