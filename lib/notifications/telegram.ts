import { db } from "@/lib/db/client";
import { group_members, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getDefaultPaymentInfo } from "@/lib/reimbursements/payment-info";

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

  const paymentText = paymentInfo
    ? paymentInfo.paymentMethod === "efectivo"
      ? "Efectivo"
      : `${paymentInfo.paymentMethod.toUpperCase()}: ${paymentInfo.value}`
    : "No configurado";

  const message = `💸 <b>Solicitud de Reintegro</b>

👤 ${requester?.name ?? "Usuario"} gastó <b>$${amount.toLocaleString("es-AR")}</b>
📁 Categoría: ${categoryName}
📝 ${description || "Sin descripción"}

💳 Datos de pago: ${paymentText}`;

  const replyMarkup = {
    inline_keyboard: [[
      { text: `✅ Pagar $${amount.toLocaleString("es-AR")}`, callback_data: `pay_reimbursement:${reimbursementId}` },
    ]],
  };

  for (const member of members) {
    if (member.telegramId) {
      await sendTelegramMessage(member.telegramId, message, { reply_markup: replyMarkup });
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

  const message = `✅ <b>Reintegro Pagado</b>

${payerName} te ha pagado <b>$${amount.toLocaleString("es-AR")}</b>

¡Ya está todo saldado! 🎉`;

  await sendTelegramMessage(requester.telegram_user_id, message);
}

export async function notifyReimbursementCancelled(
  groupId: string,
  requesterId: string,
  requesterName: string,
  amount: number,
): Promise<void> {
  const members = await getGroupMembersWithTelegram(groupId, requesterId);

  const message = `❌ <b>Reintegro Cancelado</b>

${requesterName} canceló su solicitud de reintegro de <b>$${amount.toLocaleString("es-AR")}</b>

No es necesario realizar el pago.`;

  for (const member of members) {
    if (member.telegramId) {
      await sendTelegramMessage(member.telegramId, message);
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
