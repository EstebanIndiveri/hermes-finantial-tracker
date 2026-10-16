import { eq } from "drizzle-orm";
import { telegram_delivery_outbox, telegram_operations, users } from "@/lib/db/schema";
import { buildSplitPaymentReceivedNotification } from "@/lib/notifications/telegram";
import { createTelegramDeliveryKey, createTelegramOperationContext, createTelegramOperationIdentity } from "@/lib/telegram/operation-context";
import { buildTelegramDeliveryRow } from "@/lib/telegram/outbox";
import { resolveTelegramBotId } from "@/lib/telegram/update-inbox";
import type { SplitPaymentTransaction } from "./record-payment";

export function webSplitOutboxBotId(): string | null {
  if (process.env.TELEGRAM_INBOX_ENABLED !== "true" ||
    process.env.TELEGRAM_OUTBOX_ENABLED !== "true" ||
    process.env.TELEGRAM_OUTBOX_WORKER_ENABLED !== "true" ||
    !process.env.TELEGRAM_BOT_TOKEN?.trim()) return null;
  try {
    return resolveTelegramBotId();
  } catch {
    return null;
  }
}

// Called only from the payment writer's transaction, after the payment insert.
// A replay never invokes this callback, so it never creates a second intent.
export async function enqueueWebSplitPaymentNotice(
  tx: SplitPaymentTransaction,
  input: {
    botId: string;
    operationId: string;
    paymentId: string;
    payerUserId: string;
    payeeUserId: string;
    amount: number;
    remainingDebt: number;
    sessionName: string;
  },
): Promise<boolean> {
  const [payee] = await tx.select({ chatId: users.telegram_user_id })
    .from(users).where(eq(users.id, input.payeeUserId)).limit(1);
  if (!payee?.chatId) return false;
  const [payer] = await tx.select({ username: users.username, name: users.name })
    .from(users).where(eq(users.id, input.payerUserId)).limit(1);
  const updateId = `web-split:${input.operationId}`;
  const context = createTelegramOperationContext({
    botId: input.botId, updateId, chatId: payee.chatId,
    action: "web.split.payment", suffix: input.operationId,
  });
  const identity = createTelegramOperationIdentity(context);
  const now = Date.now();
  await tx.insert(telegram_operations).values({
    operation_id: identity.operationId,
    bot_id: input.botId,
    update_id: updateId,
    operation_kind: "web.split.payment",
    status: "committed",
    resource_type: "split_payment",
    resource_id: input.paymentId,
    result_json: JSON.stringify({ payeeUserId: input.payeeUserId }),
    created_at: now,
    updated_at: now,
    committed_at: now,
  });
  await tx.insert(telegram_delivery_outbox).values(buildTelegramDeliveryRow({
    botId: input.botId,
    updateId,
    operationId: identity.operationId,
    deliveryKey: createTelegramDeliveryKey(identity, "split_payment_received", payee.chatId),
    action: "send_message",
    chatId: payee.chatId,
    text: buildSplitPaymentReceivedNotification(
      payer?.username || payer?.name || "Alguien",
      input.amount,
      input.remainingDebt,
      input.sessionName,
    ).text,
    now,
  }));
  return true;
}
