import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { bot_messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { handleTelegramMessage } from "@/lib/telegram/handlers";
import { getPersonalGroup } from "@/lib/groups/permissions";
import { randomUUID, timingSafeEqual } from "crypto";
import { handleSplitGroupMessage, handleSplitCallback } from "@/lib/telegram/splits/handler";
import {
  sendTelegramMessage as sendSplitMessage,
  editTelegramMessage,
  answerCallbackQuery,
} from "@/lib/telegram/splits/telegram-api";
import type { TelegramResponse } from "@/lib/telegram/splits/telegram-api";

// Allow up to 60 seconds for OCR + AI processing
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_SECRET_TOKEN;
  if (!secret || !expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const providedBuf = Buffer.from(secret);
  const expectedBuf = Buffer.from(expectedSecret);
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);

  if (update?.callback_query) {
    const cq = update.callback_query;
    
    try {
      await answerCallbackQuery(cq.id);
    } catch (err) {
      console.error("Failed to answer callback query (non-fatal):", {
        message: err instanceof Error ? err.message : "Unknown error",
        callback_query_id: cq.id,
      });
    }

    const chatId = String(cq.message?.chat?.id);
    const telegramUserId = String(cq.from.id);
    const data = cq.data ?? "";
    const messageId = cq.message?.message_id;

    const isGroupChat = cq.message?.chat?.type === "group" || cq.message?.chat?.type === "supergroup";

    if (isGroupChat) {
      try {
        const response = await handleSplitCallback(chatId, telegramUserId, data, messageId);
        if (response) {
          if (response.edit && messageId) {
            await editTelegramMessage(chatId, messageId, response.text, response.replyMarkup);
          } else {
            await sendSplitMessage(chatId, response.text, response.replyMarkup);
          }
        }
      } catch (err) {
        console.error("Telegram callback error:", {
          message: err instanceof Error ? err.message : "Unknown error",
          data,
        });
        try {
          await sendSplitMessage(chatId, "Ocurrió un error procesando tu acción. Intentá nuevamente.");
        } catch {
          // Best-effort: ignore if send fails
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  }

  if (!update?.message?.chat?.id || !update?.message?.from?.id) {
    return NextResponse.json({ ok: true });
  }

  const telegramUserId = String(update.message.from.id);
  const chatId = String(update.message.chat.id);
  const msg = update.message;
  const messageText =
    msg.text ?? msg.caption ??
    (msg.photo?.length ? "[photo]" : null) ??
    (msg.document ? "[document]" : null) ?? "";

  const updateId = String(update.update_id);
  const isGroupMessage = msg?.chat?.type === "group" || msg?.chat?.type === "supergroup";

  // Dedup check only for personal messages (group messages never insert into bot_messages)
  if (!isGroupMessage) {
    const existing = await db.query.bot_messages.findFirst({
      where: eq(bot_messages.telegram_update_id, updateId),
    });
    if (existing) return NextResponse.json({ ok: true });
  }

  if (isGroupMessage) {
    if (!msg.from) return NextResponse.json({ ok: true });
    
    try {
      const response = await handleSplitGroupMessage(msg);
      if (response) {
        if (typeof response === "string") {
          await sendTelegramMessage(String(msg.chat.id), response);
        } else {
          const typedResponse = response as TelegramResponse;
          await sendSplitMessage(String(msg.chat.id), typedResponse.text, typedResponse.replyMarkup);
        }
      }
    } catch (err) {
      console.error("Telegram group handler error:", {
        message: err instanceof Error ? err.message : "Unknown error",
        updateId,
      });
      try {
        await sendTelegramMessage(String(msg.chat.id), "Ocurrió un error procesando el comando. Intentá nuevamente.");
      } catch {
        // Best-effort: ignore if this send also fails
      }
    }
    return NextResponse.json({ ok: true });
  }

  const isVincular = messageText.trim().startsWith("/vincular");
  const isStartLink = messageText.trim().startsWith("/start link_");
  if (isVincular || isStartLink) {
    const handlerText = isStartLink
      ? messageText.trim().replace("/start link_", "/vincular ")
      : messageText.trim();
    const fakeUpdate = { ...update, message: { ...msg, text: handlerText } };
    let response = "Error procesando el comando.";
    try {
      response = await handleTelegramMessage(fakeUpdate, "_", "_");
    } catch (err) {
      console.error("Telegram vincular error:", err instanceof Error ? err.message : err);
    }
    await sendTelegramMessage(chatId, response);
    return NextResponse.json({ ok: true });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });

  if (!user) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hermes-finantial-tracker.vercel.app";
    await sendTelegramMessage(chatId, `Para usar el bot, vinculá tu cuenta en ${appUrl}/dashboard/settings`);
    return NextResponse.json({ ok: true });
  }

  let groupId: string | null = user.active_telegram_group_id;
  if (!groupId) {
    try {
      const personalGroup = await getPersonalGroup(user.id);
      groupId = personalGroup ?? null;
    } catch {
      groupId = null;
    }
  }

  if (!groupId) {
    await sendTelegramMessage(chatId, "No tenés ningún grupo activo. Creá uno desde la web.");
    return NextResponse.json({ ok: true });
  }

  let response_text = "Error interno.";
  try {
    response_text = await handleTelegramMessage(update, user.id, groupId);
  } catch (err) {
    console.error("Telegram handler error:", {
      message: err instanceof Error ? err.message : "Unknown error",
      updateId,
    });
    response_text = "Error procesando el mensaje.";
  }

  try {
    await db.insert(bot_messages).values({
      id: randomUUID(),
      user_id: user.id,
      telegram_chat_id: chatId,
      telegram_user_id: telegramUserId,
      telegram_update_id: updateId,
      raw_text: messageText,
      parsed_intent: null,
      response_text,
    }).onConflictDoNothing();
  } catch (err) {
    console.error("Database insert error for bot_messages:", {
      message: err instanceof Error ? err.message : "Unknown error",
      updateId,
    });
  }

  await sendTelegramMessage(chatId, response_text);
  return NextResponse.json({ ok: true });
}
