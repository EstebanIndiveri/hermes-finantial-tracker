// lib/telegram/splits/conversation-state.ts
import { db } from "@/lib/db/client";
import { bot_conversation_state } from "@/lib/db/schema";
import { and, eq, lt } from "drizzle-orm";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ConversationState {
  step: string;
  data: any;
}

/** Retrieves active conversation state for a chat+user pair. Returns null if expired or missing. */
export async function getConversationState(
  chatId: string,
  userId: string
): Promise<ConversationState | null> {
  const row = await db.query.bot_conversation_state.findFirst({
    where: and(
      eq(bot_conversation_state.chat_id, chatId),
      eq(bot_conversation_state.user_id, userId)
    ),
  });
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await clearConversationState(chatId, userId);
    return null;
  }
  return JSON.parse(row.state) as ConversationState;
}

/** Saves or updates conversation state with TTL refresh. */
export async function setConversationState(
  chatId: string,
  userId: string,
  state: ConversationState
): Promise<void> {
  const expires_at = Date.now() + TTL_MS;
  await db.insert(bot_conversation_state)
    .values({ chat_id: chatId, user_id: userId, state: JSON.stringify(state), expires_at })
    .onConflictDoUpdate({
      target: [bot_conversation_state.chat_id, bot_conversation_state.user_id],
      set: { state: JSON.stringify(state), expires_at },
    });
}

/** Clears conversation state for a chat+user. */
export async function clearConversationState(chatId: string, userId: string): Promise<void> {
  await db.delete(bot_conversation_state).where(
    and(
      eq(bot_conversation_state.chat_id, chatId),
      eq(bot_conversation_state.user_id, userId)
    )
  );
}

/** Cleans up all expired states (call periodically or from cron). */
export async function purgeExpiredStates(): Promise<void> {
  await db.delete(bot_conversation_state).where(
    lt(bot_conversation_state.expires_at, Date.now())
  );
}
