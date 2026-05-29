import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { bot_messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { handleTelegramMessage } from "@/lib/telegram/handlers";
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
    msg.text ??
    msg.caption ??
    (msg.photo?.length ? "[photo]" : null) ??
    (msg.document ? "[document]" : null) ??
    "";
  const allowedId = process.env.TELEGRAM_ALLOWED_USER_ID;

  if (!allowedId || telegramUserId !== allowedId) {
    return NextResponse.json({ ok: true });
  }

  const updateId = String(update.update_id);
  const existing = await db.query.bot_messages.findFirst({
    where: eq(bot_messages.telegram_update_id, updateId),
  });
  if (existing) return NextResponse.json({ ok: true });

  const user = await db.query.users.findFirst();
  if (!user) {
    console.error("Telegram webhook: no user found in database");
    return NextResponse.json({ ok: true });
  }

  let response_text = "Error interno.";
  try {
    response_text = await handleTelegramMessage(update, user.id);
  } catch (err) {
    const errMsg = err instanceof Error ? `${err.message}\n${err.stack?.slice(0, 300)}` : String(err);
    console.error("Telegram handler error:", { message: errMsg, updateId });
    response_text = `🔴 Debug error:\n<code>${errMsg.slice(0, 500)}</code>`;
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

  try {
    await sendTelegramMessage(chatId, response_text);
  } catch (err) {
    console.error("Failed to send Telegram message:", {
      message: err instanceof Error ? err.message : "Unknown error",
      chatId: chatId.slice(0, 4) + "...",
    });
  }

  return NextResponse.json({ ok: true });
}
