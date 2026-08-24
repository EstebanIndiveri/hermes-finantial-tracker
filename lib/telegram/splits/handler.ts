// lib/telegram/splits/handler.ts
import { db } from "@/lib/db/client";
import { users, temp_users, split_sessions, split_session_members } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { handleActivar } from "./commands/activar";
import { handleCompartido } from "./commands/compartido";
import { handleBalances } from "./commands/balances";
import { handleCerrar } from "./commands/cerrar";
import { handlePague } from "./commands/pague";
import { handleGroupPhoto } from "./commands/ocr-handler";
import { handleOcrEditInput } from "./callback-handler";
import type { OcrExpenseState } from "./callback-handler";
import { handlePaguePartialAmountInput } from "./commands/pague";
import { getConversationState } from "./conversation-state";
import type { TelegramResponse } from "./telegram-api";

interface TelegramGroupMessage {
  chat: { id: number; type: string; title?: string };
  from: { id: number; is_bot: boolean; username?: string; first_name: string; last_name?: string };
  text?: string;
  caption?: string;
  new_chat_members?: Array<{ id: number; is_bot: boolean; username?: string }>;
  photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
  document?: { file_id: string; mime_type?: string };
}

async function autoRegisterMember(chatId: string, from: TelegramGroupMessage["from"]): Promise<void> {
  const session = await db.query.split_sessions.findFirst({
    where: and(
      eq(split_sessions.telegram_chat_id, chatId),
      eq(split_sessions.status, "open")
    ),
  });

  if (!session) {
    return;
  }

  const joinedAt = Date.now();
  const telegramUserId = String(from.id);
  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });

  if (hermesUser) {
    await db.insert(split_session_members).values({
      session_id: session.id,
      user_id: hermesUser.id,
      temp_user_id: null,
      joined_at: joinedAt,
    }).onConflictDoNothing();
    return;
  }

  let tempUser = await db.query.temp_users.findFirst({
    where: eq(temp_users.telegram_user_id, telegramUserId),
  });
  let tempUserId = tempUser?.id;

  if (!tempUserId) {
    tempUserId = randomUUID();
    await db.insert(temp_users).values({
      id: tempUserId,
      telegram_user_id: telegramUserId,
      telegram_username: from.username ?? null,
      first_name: from.first_name,
      last_name: from.last_name ?? null,
      created_at: joinedAt,
      upgraded_to: null,
    }).onConflictDoNothing();

    tempUser = await db.query.temp_users.findFirst({
      where: eq(temp_users.telegram_user_id, telegramUserId),
    });

    if (!tempUser?.id) {
      return;
    }

    tempUserId = tempUser.id;
  }

  await db.insert(split_session_members).values({
    session_id: session.id,
    user_id: null,
    temp_user_id: tempUserId,
    joined_at: joinedAt,
  }).onConflictDoNothing();
}

/**
 * Routes group messages to the appropriate split command handler.
 * Returns the response text if a command was handled, or null if not.
 */
export async function handleSplitGroupMessage(message: TelegramGroupMessage): Promise<TelegramResponse | string | null> {
  const chatId = String(message.chat.id);
  const chatTitle = message.chat.title;
  const from = message.from;
  const telegramUserId = String(from.id);
  const rawText = (message.text ?? message.caption ?? "").trim();
  const text = rawText.toLowerCase();

  if (message.new_chat_members) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return null;

    const botInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    if (botInfoRes.ok) {
      const botInfo = await botInfoRes.json();
      const botId = botInfo.result?.id;
      if (botId && message.new_chat_members.some(m => m.id === botId)) {
        return [
          "🤖 ¡Hola! Soy Hermes.",
          "Para activar los gastos compartidos,",
          "un usuario registrado debe usar /activar",
          "",
          "<b>Comandos disponibles una vez activado:</b>",
          "/compartido [monto] [descripción] — registrar gasto",
          "/pague — confirmar que pagaste una deuda",
          "/balances — ver deudas actuales",
          "/cerrar — finalizar sesión",
          "",
          "También podés <b>enviar una foto de un ticket</b> para registrar el gasto automáticamente,",
          "o un <b>comprobante de transferencia</b> para confirmar un pago. 📷",
        ].join("\n");
      }
    }
  }

  if (!message.new_chat_members && !from.is_bot) {
    try {
      await autoRegisterMember(chatId, from);
    } catch (err) {
      console.error("autoRegisterMember failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }

  // Photos and image documents always take priority over text captions → OCR flow
  const hasPhoto = message.photo && message.photo.length > 0;
  const hasImageDoc = message.document?.mime_type?.startsWith("image/");
  if (hasPhoto || hasImageDoc) {
    return handleGroupPhoto(chatId, telegramUserId, message.photo, message.document);
  }

  // Check for pending OCR edit state (user typing new amount or description)
  if (!text.startsWith("/")) {
    try {
      const convState = await getConversationState(chatId, telegramUserId);
      if (
        convState?.step === "ocr_expense_edit_amount" ||
        convState?.step === "ocr_expense_edit_desc" ||
        convState?.step === "pague_partial_amount"
      ) {
        if (convState.step === "pague_partial_amount") {
          return handlePaguePartialAmountInput(chatId, telegramUserId, text, convState.data);
        }
        return handleOcrEditInput(
          chatId,
          telegramUserId,
          text,
          convState.step as "ocr_expense_edit_amount" | "ocr_expense_edit_desc",
          convState.data as OcrExpenseState
        );
      }
    } catch {
      // Non-fatal: if state lookup fails, fall through to normal routing
    }
  }

  if (text.startsWith("/activar")) {
    return handleActivar(chatId, chatTitle, telegramUserId, from.username, from.first_name, from.last_name);
  }

  if (text.startsWith("/compartido")) {
    return handleCompartido(chatId, telegramUserId, rawText);
  }

  if (text === "/balances") {
    return handleBalances(chatId);
  }

  if (text === "/cerrar") {
    return handleCerrar(chatId, telegramUserId);
  }

  if (text === "/pague") {
    return handlePague(chatId, telegramUserId);
  }

  if (text === "/ayuda" || text === "/help") {
    return [
      "🤖 <b>Comandos de Hermes Compartidos</b>",
      "",
      "/activar — activar Hermes en este grupo",
      "/compartido [monto] [descripción] — registrar gasto compartido",
      "/pague — confirmar que pagaste una deuda",
      "/balances — ver balances actuales del grupo",
      "/cerrar — cerrar la sesión actual",
      "",
      "📷 <b>También podés:</b>",
      "• Enviar una <b>foto de ticket/factura</b> para registrar el gasto automáticamente",
      "• Enviar un <b>comprobante de transferencia</b> para confirmar un pago",
    ].join("\n");
  }

  return null;
}

export { handleSplitCallback } from "./callback-handler";
