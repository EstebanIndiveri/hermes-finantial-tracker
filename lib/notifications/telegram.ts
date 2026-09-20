import { db } from "@/lib/db/client";
import { group_members, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getDefaultPaymentInfo } from "@/lib/reimbursements/payment-info";

export interface TelegramNotificationMessage {
  text: string;
  replyMarkup?: Record<string, unknown>;
}

export function buildReimbursementRequestNotification(input: {
  requesterName?: string | null;
  amount: number;
  categoryName: string;
  description: string;
  reimbursementId: string;
  paymentMethod?: string | null;
  paymentValue?: string | null;
}): TelegramNotificationMessage {
  const paymentText = input.paymentMethod
    ? input.paymentMethod === "efectivo"
      ? "Efectivo"
      : `${input.paymentMethod.toUpperCase()}: ${input.paymentValue}`
    : "No configurado";

  return {
    text: `💸 <b>Solicitud de Reintegro</b>\n\n👤 ${input.requesterName ?? "Usuario"} gastó <b>$${input.amount.toLocaleString("es-AR")}</b>\n📁 Categoría: ${input.categoryName}\n📝 ${input.description || "Sin descripción"}\n\n💳 Datos de pago: ${paymentText}`,
    replyMarkup: {
      inline_keyboard: [[
        { text: `✅ Pagar $${input.amount.toLocaleString("es-AR")}`, callback_data: `pay_reimbursement:${input.reimbursementId}` },
      ]],
    },
  };
}

export function buildReimbursementPaidNotification(payerName: string, amount: number): TelegramNotificationMessage {
  return {
    text: `✅ <b>Reintegro Pagado</b>\n\n${payerName} te ha pagado <b>$${amount.toLocaleString("es-AR")}</b>\n\n¡Ya está todo saldado! 🎉`,
  };
}

export function buildReimbursementCancelledNotification(requesterName: string, amount: number): TelegramNotificationMessage {
  return {
    text: `❌ <b>Reintegro Cancelado</b>\n\n${requesterName} canceló su solicitud de reintegro de <b>$${amount.toLocaleString("es-AR")}</b>\n\nNo es necesario realizar el pago.`,
  };
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options?: Record<string, unknown>,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.warn("TELEGRAM_BOT_TOKEN not set, skipping notification");
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...options,
      }),
    });
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
  }
}

export async function getUserById(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user ?? null;
}

export async function getGroupMembersWithTelegram(groupId: string, excludeUserId?: string) {
  const members = await db
    .select({
      userId: group_members.user_id,
      telegramId: users.telegram_user_id,
      name: users.name,
    })
    .from(group_members)
    .innerJoin(users, eq(group_members.user_id, users.id))
    .where(eq(group_members.group_id, groupId));

  return members.filter(
    (member) => member.telegramId && (!excludeUserId || member.userId !== excludeUserId),
  );
}

export async function notifyGroupOfReimbursementRequest(
  groupId: string,
  requesterId: string,
  reimbursementId: string,
  amount: number,
  categoryName: string,
  description: string,
): Promise<void> {
  const requester = await getUserById(requesterId);
  const paymentInfo = await getDefaultPaymentInfo(requesterId);
  const members = await getGroupMembersWithTelegram(groupId, requesterId);

  const notification = buildReimbursementRequestNotification({
    requesterName: requester?.name,
    amount,
    categoryName,
    description,
    reimbursementId,
    paymentMethod: paymentInfo?.paymentMethod,
    paymentValue: paymentInfo?.value,
  });

  for (const member of members) {
    if (member.telegramId) {
      await sendTelegramMessage(member.telegramId, notification.text, { reply_markup: notification.replyMarkup });
    }
  }
}

export async function notifyReimbursementPaid(
  requesterId: string,
  payerName: string,
  amount: number,
): Promise<void> {
  const requester = await getUserById(requesterId);

  if (!requester?.telegram_user_id) {
    return;
  }

  const message = buildReimbursementPaidNotification(payerName, amount);

  await sendTelegramMessage(requester.telegram_user_id, message.text);
}

export async function notifyReimbursementCancelled(
  groupId: string,
  requesterId: string,
  requesterName: string,
  amount: number,
): Promise<void> {
  const members = await getGroupMembersWithTelegram(groupId, requesterId);

  const message = buildReimbursementCancelledNotification(requesterName, amount);

  for (const member of members) {
    if (member.telegramId) {
      await sendTelegramMessage(member.telegramId, message.text);
    }
  }
}

export async function notifyReimbursementReminder(
  payerId: string,
  requesterName: string,
  amount: number,
  daysPending: number,
): Promise<void> {
  const payer = await getUserById(payerId);

  if (!payer?.telegram_user_id) {
    return;
  }

  const message = `⏰ <b>Recordatorio de Reintegro</b>

${requesterName} te solicitó un reintegro de <b>$${amount.toLocaleString("es-AR")}</b> hace ${daysPending} días.

Usa /reintegros para ver y pagar pendientes.`;

  await sendTelegramMessage(payer.telegram_user_id, message);
}

/**
 * Notifies a creditor when someone pays them (splits/shared expenses)
 */
export async function notifySplitPaymentReceived(
  payeeUserId: string,
  payerName: string,
  amount: number,
  remainingDebt: number,
  sessionName?: string,
): Promise<void> {
  const payee = await getUserById(payeeUserId);

  if (!payee?.telegram_user_id) {
    return;
  }

  const sessionText = sessionName ? `\n📁 Sesión: ${sessionName}` : "";
  const remainingText =
    remainingDebt > 0
      ? `\n💰 Deuda restante: <b>$${remainingDebt.toLocaleString("es-AR")}</b>`
      : "\n✅ ¡Deuda saldada!";

  const message = `💸 <b>Recibiste un Pago</b>

${payerName} te pagó <b>$${amount.toLocaleString("es-AR")}</b>${sessionText}${remainingText}`;

  await sendTelegramMessage(payee.telegram_user_id, message);
}
