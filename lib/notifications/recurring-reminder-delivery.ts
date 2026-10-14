import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { telegram_delivery_outbox, telegram_operations } from "@/lib/db/schema";
import { buildTelegramDeliveryRow } from "@/lib/telegram/outbox";
import { resolveTelegramBotId } from "@/lib/telegram/update-inbox";
import { getArgentinaDayBounds } from "@/lib/utils/dates";

export const RECURRING_REMINDER_OPERATION_KIND = "proactive.recurring_reminder";
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export type RecurringReminderKind = "upcoming" | "overdue";

export interface RecurringReminderContext {
  groupId: string;
  argentinaDate: string;
  reminderKind: RecurringReminderKind;
  executionIds: string[];
  snapshotHash: string;
}

export interface RecurringReminderSnapshotItem {
  id: string;
  scheduledDate: string;
  amountArs: number | null;
  recurringName: string;
  recurringAmount: number;
  categoryEmoji: string | null;
}

export function buildRecurringReminderSnapshotHash(items: RecurringReminderSnapshotItem[]): string {
  if (items.length === 0 || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Invalid recurring reminder snapshot");
  }
  const snapshot = [...items].sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export interface StoredRecurringReminderContext extends RecurringReminderContext {
  messageHash: string;
}

export function recurringReminderMessageHash(message: string): string {
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

export function buildRecurringReminderIdentity(
  botId: string,
  userId: string,
  context: Pick<RecurringReminderContext, "groupId" | "argentinaDate" | "reminderKind">,
) {
  if (!botId || !userId || !context.groupId ||
    !validArgentinaDate(context.argentinaDate) ||
    !["upcoming", "overdue"].includes(context.reminderKind)) {
    throw new Error("Invalid recurring reminder identity");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify([botId, userId, context.groupId, context.reminderKind, context.argentinaDate]))
    .digest("hex");
  const operationId = `recurring-reminder-${digest}`;
  return {
    operationId,
    updateId: `cron:recurring:${digest}`,
    deliveryKey: `${operationId}:message`,
  };
}

export function parseRecurringReminderContext(value: string | null): StoredRecurringReminderContext | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.groupId !== "string" || !record.groupId ||
      !validArgentinaDate(record.argentinaDate) ||
      (record.reminderKind !== "upcoming" && record.reminderKind !== "overdue") ||
      !Array.isArray(record.executionIds) || record.executionIds.length === 0 ||
      !record.executionIds.every((id) => typeof id === "string" && id.length > 0) ||
      new Set(record.executionIds).size !== record.executionIds.length ||
      typeof record.snapshotHash !== "string" || !/^[a-f0-9]{64}$/.test(record.snapshotHash) ||
      typeof record.messageHash !== "string" || !/^[a-f0-9]{64}$/.test(record.messageHash)) return null;
    return record as unknown as StoredRecurringReminderContext;
  } catch {
    return null;
  }
}

export async function enqueueRecurringReminder({
  userId,
  chatId,
  context,
  message,
  now = Date.now(),
}: {
  userId: string;
  chatId: string;
  context: RecurringReminderContext;
  message: string;
  now?: number;
}): Promise<boolean> {
  const storedContext: StoredRecurringReminderContext = {
    ...context,
    messageHash: recurringReminderMessageHash(message),
  };
  const encodedContext = JSON.stringify(storedContext);
  if (!chatId || !parseRecurringReminderContext(encodedContext)) {
    throw new Error("Recurring reminder destination or context unavailable");
  }
  const botId = resolveTelegramBotId();
  const identity = buildRecurringReminderIdentity(botId, userId, context);
  const delivery = buildTelegramDeliveryRow({
    botId,
    updateId: identity.updateId,
    operationId: identity.operationId,
    deliveryKey: identity.deliveryKey,
    action: "send_message",
    chatId,
    text: message,
    now,
  });

  const parent = await db.insert(telegram_operations).values({
    operation_id: identity.operationId,
    bot_id: botId,
    update_id: identity.updateId,
    operation_kind: RECURRING_REMINDER_OPERATION_KIND,
    status: "committed",
    resource_type: "recurring_reminder",
    resource_id: userId,
    result_json: encodedContext,
    created_at: now,
    updated_at: now,
    committed_at: now,
  }).onConflictDoNothing({ target: telegram_operations.operation_id })
    .returning({ operationId: telegram_operations.operation_id });
  if (parent.length === 0) {
    const [existing] = await db.select({
      kind: telegram_operations.operation_kind,
      createdAt: telegram_operations.created_at,
      context: telegram_operations.result_json,
    }).from(telegram_operations).where(eq(telegram_operations.operation_id, identity.operationId)).limit(1);
    if (!existing || existing.kind !== RECURRING_REMINDER_OPERATION_KIND ||
      existing.context !== encodedContext ||
      now - existing.createdAt >= DELIVERY_RETENTION_MS) return false;
  }
  const inserted = await db.insert(telegram_delivery_outbox)
    .values(delivery)
    .onConflictDoNothing({
      target: [telegram_delivery_outbox.bot_id, telegram_delivery_outbox.delivery_key],
    })
    .returning({ id: telegram_delivery_outbox.id });
  return inserted.length === 1;
}
