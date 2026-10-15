import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { telegram_delivery_outbox, telegram_operations } from "@/lib/db/schema";
import { buildTelegramDeliveryRow } from "@/lib/telegram/outbox";
import { resolveTelegramBotId } from "@/lib/telegram/update-inbox";
import { getArgentinaDayBounds } from "@/lib/utils/dates";

export const REIMBURSEMENT_REMINDER_OPERATION_KIND = "proactive.reimbursement_reminder";
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface ReimbursementReminderSnapshot {
  requestId: string;
  transactionId: string;
  payerId: string;
  requesterId: string;
  groupId: string;
  amount: number;
  createdAt: number;
  requesterName: string;
}

export interface ReimbursementReminderContext {
  requestId: string;
  groupId: string;
  argentinaDate: string;
  snapshotHash: string;
}

export interface StoredReimbursementReminderContext extends ReimbursementReminderContext {
  messageHash: string;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildReimbursementReminderSnapshotHash(snapshot: ReimbursementReminderSnapshot): string {
  if (!snapshot.requestId || !snapshot.transactionId || !snapshot.payerId || !snapshot.requesterId ||
    !snapshot.groupId || !Number.isFinite(snapshot.amount) || !Number.isFinite(snapshot.createdAt)) {
    throw new Error("Invalid reimbursement reminder snapshot");
  }
  return hash(snapshot);
}

export function reimbursementReminderMessageHash(message: string): string {
  return createHash("sha256").update(message).digest("hex");
}

function validArgentinaDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    getArgentinaDayBounds(value);
    return true;
  } catch {
    return false;
  }
}

export function buildReimbursementReminderIdentity(botId: string, payerId: string, requestId: string, argentinaDate: string) {
  if (!botId || !payerId || !requestId || !validArgentinaDate(argentinaDate)) {
    throw new Error("Invalid reimbursement reminder identity");
  }
  const digest = hash([botId, payerId, requestId, argentinaDate]);
  const operationId = `reimbursement-reminder-${digest}`;
  return { operationId, updateId: `cron:reimbursement:${digest}`, deliveryKey: `${operationId}:message` };
}

export function parseReimbursementReminderContext(value: string | null): StoredReimbursementReminderContext | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.requestId !== "string" || !record.requestId ||
      typeof record.groupId !== "string" || !record.groupId ||
      !validArgentinaDate(record.argentinaDate) ||
      typeof record.snapshotHash !== "string" || !/^[a-f0-9]{64}$/.test(record.snapshotHash) ||
      typeof record.messageHash !== "string" || !/^[a-f0-9]{64}$/.test(record.messageHash)) return null;
    return record as unknown as StoredReimbursementReminderContext;
  } catch {
    return null;
  }
}

export function buildReimbursementReminderMessage(requesterName: string, amount: number, daysPending: number): string {
  const safeName = requesterName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `⏰ <b>Recordatorio de Reintegro</b>\n\n${safeName} te solicitó un reintegro de <b>ARS $${amount.toLocaleString("es-AR")}</b> hace ${daysPending} días.\n\nUsa /reintegros para ver y pagar pendientes.`;
}

export async function enqueueReimbursementReminder({
  payerId, chatId, context, message, now = Date.now(),
}: {
  payerId: string;
  chatId: string;
  context: ReimbursementReminderContext;
  message: string;
  now?: number;
}): Promise<boolean> {
  const storedContext: StoredReimbursementReminderContext = {
    ...context,
    messageHash: reimbursementReminderMessageHash(message),
  };
  const encodedContext = JSON.stringify(storedContext);
  if (!chatId || !parseReimbursementReminderContext(encodedContext)) {
    throw new Error("Reimbursement reminder destination or context unavailable");
  }
  const botId = resolveTelegramBotId();
  const identity = buildReimbursementReminderIdentity(botId, payerId, context.requestId, context.argentinaDate);
  const delivery = buildTelegramDeliveryRow({
    botId, updateId: identity.updateId, operationId: identity.operationId,
    deliveryKey: identity.deliveryKey, action: "send_message", chatId, text: message, now,
  });
  const parent = await db.insert(telegram_operations).values({
    operation_id: identity.operationId, bot_id: botId, update_id: identity.updateId,
    operation_kind: REIMBURSEMENT_REMINDER_OPERATION_KIND, status: "committed",
    resource_type: "reimbursement_reminder", resource_id: payerId,
    result_json: encodedContext, created_at: now, updated_at: now, committed_at: now,
  }).onConflictDoNothing({ target: telegram_operations.operation_id })
    .returning({ operationId: telegram_operations.operation_id });
  if (parent.length === 0) {
    const [existing] = await db.select({
      kind: telegram_operations.operation_kind,
      createdAt: telegram_operations.created_at,
      context: telegram_operations.result_json,
    }).from(telegram_operations).where(eq(telegram_operations.operation_id, identity.operationId)).limit(1);
    if (!existing || existing.kind !== REIMBURSEMENT_REMINDER_OPERATION_KIND ||
      existing.context !== encodedContext || now - existing.createdAt >= DELIVERY_RETENTION_MS) return false;
  }
  const inserted = await db.insert(telegram_delivery_outbox).values(delivery).onConflictDoNothing({
    target: [telegram_delivery_outbox.bot_id, telegram_delivery_outbox.delivery_key],
  }).returning({ id: telegram_delivery_outbox.id });
  return inserted.length === 1;
}
