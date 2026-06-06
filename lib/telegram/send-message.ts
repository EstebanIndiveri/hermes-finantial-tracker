// Re-export shared types from the canonical source
export type { InlineKeyboardButton, InlineKeyboardMarkup } from "./splits/telegram-api";
export { buildInlineKeyboard as buildPersonalKeyboard } from "./splits/telegram-api";

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: import("./splits/telegram-api").InlineKeyboardMarkup
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}

export async function editTelegramPersonalMessage(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: import("./splits/telegram-api").InlineKeyboardMarkup
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // 400 = message not modified — not an error
  if (!res.ok && res.status !== 400) {
    const err = await res.text();
    throw new Error(`Telegram editMessage error: ${err}`);
  }
}
