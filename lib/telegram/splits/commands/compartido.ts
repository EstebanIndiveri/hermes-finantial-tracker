// lib/telegram/splits/commands/compartido.ts
import { db } from "@/lib/db/client";
import { users, split_sessions, split_session_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { setConversationState } from "../conversation-state";
import type { TelegramResponse } from "../telegram-api";
import { buildInlineKeyboard } from "../telegram-api";

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

  const membersRows = await db.query.split_session_members.findMany({
    where: eq(split_session_members.session_id, session.id),
    with: { user: true },
  });

  if (!membersRows.some(m => m.user_id === hermesUser.id)) {
    await db.insert(split_session_members).values({
      session_id: session.id,
      user_id: hermesUser.id,
      temp_user_id: null,
      joined_at: Date.now(),
    }).onConflictDoNothing();
    
    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, hermesUser.id),
    });
    if (updatedUser) {
      membersRows.push({
        session_id: session.id,
        user_id: hermesUser.id,
        temp_user_id: null,
        joined_at: Date.now(),
        user: updatedUser,
      } as any);
    }
  }

  const buttons = membersRows
    .filter(m => m.user)
    .map(m => {
      const isCurrentUser = m.user_id === hermesUser.id;
      const displayName = isCurrentUser 
        ? `${m.user!.username || m.user!.name} (vos)` 
        : (m.user!.username || m.user!.name);
      return [{ text: displayName, callback_data: `paid_by:${m.user_id}` }];
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
