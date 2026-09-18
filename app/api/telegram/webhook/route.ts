import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { bot_messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { handleTelegramMessage, PersonalBotMessage } from "@/lib/telegram/handlers";
import { randomUUID, timingSafeEqual } from "crypto";
import { handleSplitGroupMessage, handleSplitCallback } from "@/lib/telegram/splits/handler";
import {
  sendTelegramMessage as sendSplitMessage,
  editTelegramMessage,
  answerCallbackQuery,
} from "@/lib/telegram/splits/telegram-api";
import type { TelegramResponse } from "@/lib/telegram/splits/telegram-api";
import { handlePersonalCallback } from "@/lib/telegram/personal-callback-handler";
import { editTelegramPersonalMessage } from "@/lib/telegram/send-message";
import { transcribeVoiceMessage } from "@/lib/telegram/voice";
import { resolveAuthorizedTelegramGroup } from "@/lib/telegram/authorized-group-context";
import {
  claimTelegramUpdate,
  completeTelegramUpdate,
  failTelegramUpdate,
  resolveTelegramBotId,
} from "@/lib/telegram/update-inbox";

// Allow up to 60 seconds for OCR + AI + Voice processing
export const maxDuration = 60;

type TelegramUpdateKind = "callback" | "new_member" | "voice" | "photo" | "document" | "text" | "other";

interface TelegramWebhookMessage {
  chat: { id: number; type: string; title?: string };
  from: { id: number; is_bot: boolean; username?: string; first_name: string; last_name?: string };
  text?: string;
  caption?: string;
  voice?: { file_id: string };
  audio?: { file_id: string };
  photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
  document?: { file_id: string; mime_type?: string; file_name?: string };
  new_chat_members?: Array<{ id: number; is_bot: boolean; username?: string }>;
}

interface TelegramWebhookCallbackQuery {
  id: string;
  from: { id: number };
  data?: string;
  message?: { message_id?: number; chat?: { id: number; type: string } };
}

interface TelegramWebhookUpdate {
  update_id: number;
  message?: TelegramWebhookMessage;
  callback_query?: TelegramWebhookCallbackQuery;
}

function classifyTelegramUpdate(update: unknown): TelegramUpdateKind {
  if (!update || typeof update !== "object") return "other";
  const candidate = update as {
    callback_query?: unknown;
    message?: {
      new_chat_members?: unknown[];
      voice?: unknown;
      audio?: unknown;
      photo?: unknown[];
      document?: unknown;
      text?: unknown;
      caption?: unknown;
    };
  };
  if (candidate.callback_query) return "callback";
  const message = candidate.message;
  if (!message) return "other";
  if (message.new_chat_members?.length) return "new_member";
  if (message.voice || message.audio) return "voice";
  if (message.photo?.length) return "photo";
  if (message.document) return "document";
  if (typeof message.text === "string" || typeof message.caption === "string") return "text";
  return "other";
}

function stableTelegramErrorCode(error: unknown): string {
  void error;
  return "HANDLER_ERROR";
}

async function processTelegramUpdate(
  update: TelegramWebhookUpdate,
  useLegacyBotMessageDedupe = true,
): Promise<NextResponse> {
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

    // Personal chat callback
    const personalChatId = String(cq.message?.chat?.id ?? cq.from.id);
    
    try {
      const personalUser = await db.query.users.findFirst({
        where: eq(users.telegram_user_id, telegramUserId),
      });
      if (!personalUser) {
        await sendTelegramMessage(personalChatId, "Tu sesión expiró. Vinculá tu cuenta nuevamente.");
      } else {
        const personalGroupId = await resolveAuthorizedTelegramGroup(
          personalUser.id,
          personalUser.active_telegram_group_id,
        );
        
        if (!personalGroupId) {
          await sendTelegramMessage(personalChatId, "No tenés ningún grupo activo. Creá uno desde la web.");
        } else {
          const response = await handlePersonalCallback(
            personalChatId, telegramUserId, personalUser.id, personalGroupId, data, messageId
          );
          if (response.edit === true && messageId) {
            await editTelegramPersonalMessage(personalChatId, messageId, response.text, response.replyMarkup);
          } else {
            await sendTelegramMessage(personalChatId, response.text, response.replyMarkup);
          }
        }
      }
    } catch (err) {
      console.error("Personal callback error:", { message: err instanceof Error ? err.message : "Unknown error", data });
      try {
        await sendTelegramMessage(personalChatId, "Ocurrió un error. Intentá nuevamente.");
      } catch { /* best-effort */ }
    }
    return NextResponse.json({ ok: true });
  }

  if (!update?.message?.chat?.id || !update?.message?.from?.id) {
    return NextResponse.json({ ok: true });
  }

  const telegramUserId = String(update.message.from.id);
  const chatId = String(update.message.chat.id);
  const msg = update.message;
  const isGroupMessage = msg.chat.type === "group" || msg.chat.type === "supergroup";
  
  // Classify the chat before STT. Group voice belongs to Split, never to the
  // personal handler or the user's active personal group.
  if (msg.voice || msg.audio) {
    const voiceFileId = msg.voice?.file_id ?? msg.audio?.file_id;

    if (!voiceFileId) {
      const send = isGroupMessage ? sendSplitMessage : sendTelegramMessage;
      await send(chatId, "❌ Error: no se pudo obtener el archivo de audio.");
      return NextResponse.json({ ok: true });
    }

    if (isGroupMessage) {
      await sendSplitMessage(chatId, "🎤 <i>Procesando audio...</i>").catch(() => {});

      try {
        const transcription = await transcribeVoiceMessage(voiceFileId);
        if (!transcription) {
          await sendSplitMessage(chatId, "❌ No pude transcribir el audio. Intentá de nuevo o escribí el mensaje.");
          return NextResponse.json({ ok: true });
        }

        const groupMessage = { ...msg, text: transcription };
        const splitResponse = await handleSplitGroupMessage(groupMessage);
        if (splitResponse) {
          if (typeof splitResponse === "string") {
            await sendSplitMessage(chatId, splitResponse);
          } else {
            await sendSplitMessage(chatId, splitResponse.text, splitResponse.replyMarkup);
          }
        }
      } catch (err) {
        console.error("Group voice processing error:", {
          message: err instanceof Error ? err.message : "Unknown error",
        });
        await sendSplitMessage(chatId, "❌ Error procesando el audio. Intentá de nuevo.").catch(() => {
          // Best-effort: Telegram delivery failure must not turn the webhook into a retryable 5xx.
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Resolve the user and current authorized group before invoking STT. An
    // ex-member must not spend processing or reach the financial handler.
    const user = await db.query.users.findFirst({
      where: eq(users.telegram_user_id, telegramUserId),
    });

    if (!user) {
      await sendTelegramMessage(chatId, "Para usar el bot, vinculá tu cuenta en la configuración.");
      return NextResponse.json({ ok: true });
    }

    const groupId = await resolveAuthorizedTelegramGroup(
      user.id,
      user.active_telegram_group_id,
    );

    if (!groupId) {
      await sendTelegramMessage(chatId, "No tenés ningún grupo activo. Creá uno desde la web.");
      return NextResponse.json({ ok: true });
    }

    // Send immediate feedback while processing
    await sendTelegramMessage(chatId, "🎤 <i>Procesando audio...</i>").catch(() => {});

    try {
      const transcription = await transcribeVoiceMessage(voiceFileId);
      
      if (!transcription) {
        await sendTelegramMessage(chatId, "❌ No pude transcribir el audio. Intentá de nuevo o escribí el mensaje.");
        return NextResponse.json({ ok: true });
      }

      // Process transcribed text through normal flow
      const fakeUpdate = { 
        ...update, 
        message: { ...msg, text: transcription } 
      };

      const botResponse = await handleTelegramMessage(fakeUpdate, user.id, groupId);
      await sendTelegramMessage(chatId, `🎤 "${transcription}"\n\n${botResponse.text}`, botResponse.replyMarkup);
      return NextResponse.json({ ok: true });

    } catch (err) {
      console.error("Voice processing error:", err);
      await sendTelegramMessage(chatId, "❌ Error procesando el audio: " + (err instanceof Error ? err.message : "desconocido"));
      return NextResponse.json({ ok: true });
    }
  }
  
  // Regular text message handling
  const messageText =
    msg.text ?? msg.caption ??
    (msg.photo?.length ? "[photo]" : null) ??
    (msg.document ? "[document]" : null) ?? "";

  const updateId = String(update.update_id);

  // Dedup check only for personal messages (group messages never insert into bot_messages)
  if (useLegacyBotMessageDedupe && !isGroupMessage) {
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
    let botResponse: PersonalBotMessage = { text: "Error procesando el comando." };
    try {
      botResponse = await handleTelegramMessage(fakeUpdate, "_", "_");
    } catch (err) {
      console.error("Telegram vincular error:", err instanceof Error ? err.message : err);
    }
    await sendTelegramMessage(chatId, botResponse.text, botResponse.replyMarkup);
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

  const groupId = await resolveAuthorizedTelegramGroup(
    user.id,
    user.active_telegram_group_id,
  );

  if (!groupId) {
    await sendTelegramMessage(chatId, "No tenés ningún grupo activo. Creá uno desde la web.");
    return NextResponse.json({ ok: true });
  }

  let botResponse: PersonalBotMessage = { text: "Error interno." };
  try {
    botResponse = await handleTelegramMessage(update, user.id, groupId);
  } catch (err) {
    console.error("Telegram handler error:", {
      message: err instanceof Error ? err.message : "Unknown error",
      updateId,
    });
    botResponse = { text: "Error procesando el mensaje." };
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
      response_text: botResponse.text,
    }).onConflictDoNothing();
  } catch (err) {
    console.error("Database insert error for bot_messages:", {
      message: err instanceof Error ? err.message : "Unknown error",
      updateId,
    });
  }

  await sendTelegramMessage(chatId, botResponse.text, botResponse.replyMarkup);
  return NextResponse.json({ ok: true });
}

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
  if (process.env.TELEGRAM_INBOX_ENABLED !== "true") {
    return processTelegramUpdate(update, true);
  }

  if (!update || typeof update !== "object" || !("update_id" in update)) {
    return NextResponse.json({ ok: true });
  }

  const rawUpdateId = (update as { update_id: unknown }).update_id;
  if (typeof rawUpdateId !== "number" || !Number.isSafeInteger(rawUpdateId) || rawUpdateId < 0) {
    return NextResponse.json({ ok: true });
  }
  const updateId = String(rawUpdateId);
  const updateKind = classifyTelegramUpdate(update);
  let botId: string;
  let claim: Awaited<ReturnType<typeof claimTelegramUpdate>>;
  try {
    botId = resolveTelegramBotId();
    claim = await claimTelegramUpdate({ botId, updateId, updateKind });
  } catch {
    return NextResponse.json({ error: "Telegram update claim unavailable" }, { status: 503 });
  }

  if (claim.kind === "completed" || claim.kind === "busy") {
    return NextResponse.json({ ok: true });
  }

  try {
    const response = await processTelegramUpdate(update, false);
    await completeTelegramUpdate({ botId, updateId, leaseToken: claim.leaseToken });
    return response;
  } catch (error) {
    await failTelegramUpdate({
      botId,
      updateId,
      leaseToken: claim.leaseToken,
      errorCode: stableTelegramErrorCode(error),
    }).catch(() => false);
    return NextResponse.json({ error: "Telegram update processing failed" }, { status: 503 });
  }
}
