import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { bot_messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { handleTelegramMessage } from "@/lib/telegram/handlers";
import { getPersonalGroup } from "@/lib/groups/permissions";
import { randomUUID, timingSafeEqual } from "crypto";

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
  const existing = await db.query.bot_messages.findFirst({
    where: eq(bot_messages.telegram_update_id, updateId),
  });
  if (existing) return NextResponse.json({ ok: true });

  // Handle /vincular and /start link_CODE before user lookup — these work for unlinked users
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

  // Find user by telegram_user_id
  const user = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });

  if (!user) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hermes-finantial-tracker.vercel.app";
    await sendTelegramMessage(chatId, `Para usar el bot, vinculá tu cuenta en ${appUrl}/dashboard/settings`);
    return NextResponse.json({ ok: true });
  }

  // Resolve active group: user's active_telegram_group_id or personal group
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
