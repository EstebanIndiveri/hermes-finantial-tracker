// lib/telegram/splits/commands/ocr-handler.ts
import { ocrTelegramPhoto, ocrTelegramDocument } from "@/lib/telegram/ocr";
import { parseReceiptText } from "@/lib/ai/parse-receipt";
import { db } from "@/lib/db/client";
import { split_sessions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { setConversationState } from "../conversation-state";
import type { TelegramResponse } from "../telegram-api";
import { buildInlineKeyboard, sendTelegramMessage as sendMsg } from "../telegram-api";

type TelegramPhotoSize = { file_id: string; file_size?: number; width: number; height: number };
type TelegramDocument = { file_id: string; mime_type?: string };

const TRANSFER_KEYWORDS = [
  "transferencia", "mercadopago", "mercado pago",
  "cbu", "cvu", "cuil", "alias", "comprobante",
  "enviaste", "recibiste", "transferiste", "pago enviado",
];

function isTransferReceipt(text: string): boolean {
  const lower = text.toLowerCase();
  return TRANSFER_KEYWORDS.filter(kw => lower.includes(kw)).length >= 2;
}

/**
 * Handles a photo or image document sent in a group with an active session.
 * Sends "🔄 Procesando..." immediately, then runs OCR + AI parsing.
 * Always sends the result directly via sendMsg — returns null (already handled).
 */
export async function handleGroupPhoto(
  chatId: string,
  telegramUserId: string,
  photoArray?: TelegramPhotoSize[],
  documentData?: TelegramDocument
): Promise<TelegramResponse | null> {
  const session = await db.query.split_sessions.findFirst({
    where: and(
      eq(split_sessions.telegram_chat_id, chatId),
      eq(split_sessions.status, "open")
    ),
  });
  if (!session) {
    await sendMsg(chatId, "📷 Foto recibida, pero no hay ninguna sesión activa.\n\nUsá /activar para crear una nueva sesión compartida.");
    return null;
  }

  // Send immediate feedback so user knows the bot is working
  await sendMsg(chatId, "🔄 Procesando imagen...");

  // Run OCR
  let ocrResult;
  try {
    ocrResult = documentData
      ? await ocrTelegramDocument(documentData)
      : photoArray
        ? await ocrTelegramPhoto(photoArray)
        : null;
  } catch (err) {
    console.error("OCR error in group photo:", err instanceof Error ? err.message : err);
    await sendMsg(chatId, "❌ No pude leer la imagen. Usá /compartido [monto] [descripción] para registrar el gasto manualmente.");
    return null;
  }

  if (!ocrResult?.text) {
    await sendMsg(chatId, "❌ No pude extraer texto de la imagen. Usá /compartido [monto] [descripción] para registrar el gasto manualmente.");
    return null;
  }

  const rawText = ocrResult.text;
  const isTransfer = isTransferReceipt(rawText);
  const parsed = await parseReceiptText(rawText).catch(() => null);

  if (isTransfer) {
    if (!parsed?.amount_ars) {
      await sendMsg(chatId, "💳 Comprobante de transferencia detectado, pero no pude leer el monto.\nUsá /pague para registrar el pago manualmente.");
      return null;
    }

    const formattedAmount = parsed.amount_ars.toLocaleString("es-AR", { minimumFractionDigits: 0 });

    await setConversationState(chatId, telegramUserId, {
      step: "ocr_payment_confirm",
      data: {
        step: "ocr_payment_confirm",
        amount: parsed.amount_ars,
        session_id: session.id,
        ocr_raw_text: rawText.slice(0, 500),
      },
    });

    await sendMsg(chatId, [
      "💳 <b>Comprobante de transferencia detectado</b>",
      "",
      `💰 Monto: <b>$${formattedAmount}</b>`,
      "",
      "¿Registramos este pago?",
    ].join("\n"), buildInlineKeyboard([
      [{ text: "✅ Sí, registrar pago", callback_data: "ocr_payment:confirm" }],
      [{ text: "❌ No", callback_data: "ocr_payment:cancel" }],
    ]));
    return null;
  }

  // Merchant ticket
  if (!parsed?.amount_ars) {
    await sendMsg(chatId, [
      "🧾 Ticket recibido pero no pude leer el monto total.",
      "",
      `Texto detectado: <code>${rawText.slice(0, 150)}</code>`,
      "",
      "Usá /compartido [monto] [descripción] para registrarlo manualmente.",
    ].join("\n"));
    return null;
  }

  const merchant = parsed.merchant || "Gasto compartido";
  const formattedAmount = parsed.amount_ars.toLocaleString("es-AR", { minimumFractionDigits: 0 });

  await setConversationState(chatId, telegramUserId, {
    step: "ocr_expense_confirm",
    data: {
      step: "ocr_expense_confirm",
      amount: parsed.amount_ars,
      description: merchant,
      session_id: session.id,
      ocr_raw_text: rawText.slice(0, 500),
    },
  });

  await sendMsg(chatId, [
    "🧾 <b>Ticket detectado</b>",
    "",
    `🏪 Comercio: <b>${merchant}</b>`,
    `💰 Total: <b>$${formattedAmount}</b>`,
    "",
    "¿Registramos este gasto compartido?",
  ].join("\n"), buildInlineKeyboard([
    [{ text: "✅ Sí, registrar gasto", callback_data: "ocr_expense:confirm" }],
    [{ text: "✏️ Cambiar monto/descripción", callback_data: "ocr_expense:edit" }],
    [{ text: "❌ No", callback_data: "ocr_expense:cancel" }],
  ]));
  return null;
}
