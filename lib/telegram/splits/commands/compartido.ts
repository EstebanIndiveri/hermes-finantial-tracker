// lib/telegram/splits/commands/compartido.ts
import { db } from "@/lib/db/client";
import { users, temp_users, split_sessions, split_session_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { setConversationState } from "../conversation-state";
import type { TelegramResponse } from "../telegram-api";
import { buildInlineKeyboard } from "../telegram-api";

const getHermesDisplayName = (user: typeof users.$inferSelect): string => user.username || user.name;
const getTempDisplayName = (tempUser: typeof temp_users.$inferSelect): string => {
  if (tempUser.telegram_username) {
    return tempUser.telegram_username.startsWith("@") ? tempUser.telegram_username : `@${tempUser.telegram_username}`;
  }
  return tempUser.first_name;
};

/**
 * Handles /compartido [monto] [descripción] command.
 * Starts a multi-step flow to register a shared expense.
 */
export async function handleCompartido(
  chatId: string,
  telegramUserId: string,
  rawText: string
): Promise<TelegramResponse> {
  const parts = rawText.trim().split(/\s+/);
  const amountStr = parts[1];
  const description = parts.slice(2).join(" ") || "Gasto compartido";

  const amount = parseFloat(amountStr?.replace(",", ".") ?? "");
  if (!amountStr || isNaN(amount) || amount <= 0) {
    return {
      text: "❌ Formato incorrecto. Usá:\n<code>/compartido [monto] [descripción]</code>\nEjemplo: <code>/compartido 5000 sushi tepayaki</code>",
    };
  }

  const session = await db.query.split_sessions.findFirst({
    where: and(
      eq(split_sessions.telegram_chat_id, chatId),
      eq(split_sessions.status, "open")
    ),
  });
  if (!session) {
    return {
      text: "❌ No hay sesión activa en este grupo. Usá /activar para crear una.",
    };
  }

  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });
  if (!hermesUser) {
    return {
      text: "❌ No tenés cuenta en Hermes. Registrate en la web para registrar gastos.",
    };
  }

  let membersRows = await db.query.split_session_members.findMany({
    where: eq(split_session_members.session_id, session.id),
    with: { user: true, tempUser: true },
  });

  if (!membersRows.some(m => m.user_id === hermesUser.id)) {
    await db.insert(split_session_members).values({
      session_id: session.id,
      user_id: hermesUser.id,
      temp_user_id: null,
      joined_at: Date.now(),
    }).onConflictDoNothing();

    membersRows = await db.query.split_session_members.findMany({
      where: eq(split_session_members.session_id, session.id),
      with: { user: true, tempUser: true },
    });
  }

  // Deduplicate members defensively (guards against missing DB unique constraints)
  const seenUserIds = new Set<string>();
  const seenTempIds = new Set<string>();
  const uniqueMembers = membersRows.filter(m => {
    if (m.user_id) {
      if (seenUserIds.has(m.user_id)) return false;
      seenUserIds.add(m.user_id);
      return true;
    }
    if (m.temp_user_id) {
      if (seenTempIds.has(m.temp_user_id)) return false;
      seenTempIds.add(m.temp_user_id);
      return true;
    }
    return false;
  });

  const buttons = uniqueMembers.flatMap((member) => {
    if (member.user && member.user_id) {
      const isCurrentUser = member.user_id === hermesUser.id;
      const displayName = isCurrentUser
        ? `${getHermesDisplayName(member.user)} (vos)`
        : getHermesDisplayName(member.user);
      return [[{ text: displayName, callback_data: `paid_by:user:${member.user_id}` }]];
    }

    if (member.tempUser && member.temp_user_id) {
      return [[{ text: getTempDisplayName(member.tempUser), callback_data: `paid_by:temp:${member.temp_user_id}` }]];
    }

    return [];
  });

  buttons.push([{ text: "💳 Pagaron varios", callback_data: "paid_by:varios" }]);

  const keyboard = buildInlineKeyboard(buttons);

  const state = {
    step: "who_paid" as const,
    amount,
    description,
    session_id: session.id,
  };

  await setConversationState(chatId, telegramUserId, { step: state.step, data: state });

  const formattedAmount = amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });

  return {
    text: [
      "💳 ¿Quién pagó?",
      `${description} — $${formattedAmount}`,
    ].join("\n"),
    replyMarkup: keyboard,
  };
}
