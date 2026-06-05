// lib/telegram/splits/commands/ocr-handler.ts
import { ocrTelegramPhoto, ocrTelegramDocument } from "@/lib/telegram/ocr";
import { parseReceiptText } from "@/lib/ai/parse-receipt";
import { db } from "@/lib/db/client";
import { split_sessions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { setConversationState } from "../conversation-state";
import type { TelegramResponse } from "../telegram-api";
import { buildInlineKeyboard } from "../telegram-api";

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
 * Handles a photo or image document sent in a group.
 * If there's an active session, runs OCR and detects:
 *  - merchant ticket → ask to register as compartido
 *  - transfer receipt → ask to register as /pague payment
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
  if (!session) return null;

  // Run OCR on the image
  let ocrResult;
  try {
    ocrResult = documentData
      ? await ocrTelegramDocument(documentData)
      : photoArray
        ? await ocrTelegramPhoto(photoArray)
        : null;
  } catch (err) {
    console.error("OCR error in group photo:", err instanceof Error ? err.message : err);
    return null;
  }

  if (!ocrResult?.text) return null;

  const rawText = ocrResult.text;
  const isTransfer = isTransferReceipt(rawText);

  const parsed = await parseReceiptText(rawText).catch(() => null);

  if (isTransfer) {
    if (!parsed?.amount_ars) {
      return {
        text: "💳 Comprobante de transferencia detectado, pero no pude leer el monto.\nUsá /pague para registrar el pago manualmente.",
      };
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

    return {
      text: [
        "💳 <b>Comprobante de transferencia detectado</b>",
        "",
        `💰 Monto: <b>$${formattedAmount}</b>`,
        "",
        "¿Registramos este pago?",
      ].join("\n"),
      replyMarkup: buildInlineKeyboard([
        [{ text: "✅ Sí, registrar pago", callback_data: "ocr_payment:confirm" }],
        [{ text: "❌ No", callback_data: "ocr_payment:cancel" }],
      ]),
    };
  }

  // Merchant ticket
  if (!parsed?.amount_ars) {
    return {
      text: "🧾 Imagen recibida pero no pude leer el monto.\nUsá /compartido [monto] [descripción] para registrar el gasto.",
    };
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

  return {
    text: [
      "🧾 <b>Ticket detectado</b>",
      "",
      `🏪 Comercio: <b>${merchant}</b>`,
      `💰 Total: <b>$${formattedAmount}</b>`,
      "",
      "¿Registramos este gasto compartido?",
    ].join("\n"),
    replyMarkup: buildInlineKeyboard([
      [{ text: "✅ Sí, registrar gasto", callback_data: "ocr_expense:confirm" }],
      [{ text: "✏️ Cambiar monto/descripción", callback_data: "ocr_expense:edit" }],
      [{ text: "❌ No", callback_data: "ocr_expense:cancel" }],
    ]),
  };
}
