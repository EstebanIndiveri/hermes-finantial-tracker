import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { telegram_delivery_outbox, telegram_operations } from "@/lib/db/schema";
import { buildTelegramDeliveryRow } from "@/lib/telegram/outbox";
import { resolveTelegramBotId } from "@/lib/telegram/update-inbox";

export const DAILY_SUMMARY_OPERATION_KIND = "proactive.daily_summary";
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface DailySummaryContext {
  groupId: string;
}

export function buildDailySummaryIdentity(botId: string, userId: string, argentinaDate: string) {
  if (!botId || !userId || !/^\d{4}-\d{2}-\d{2}$/.test(argentinaDate)) {
    throw new Error("Invalid daily summary identity");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify([botId, userId, argentinaDate]))
    .digest("hex");
  const operationId = `daily-summary-${digest}`;
  return {
    operationId,
    updateId: `cron:daily:${digest}`,
    deliveryKey: `${operationId}:message`,
  };
}

export function parseDailySummaryContext(value: string | null): DailySummaryContext | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const groupId = (parsed as Record<string, unknown>).groupId;
    return typeof groupId === "string" && groupId.trim().length > 0 ? { groupId } : null;
  } catch {
    return null;
  }
}

export async function enqueueDailySummary({
  userId,
  groupId,
  chatId,
  argentinaDate,
  message,
  now = Date.now(),
}: {
  userId: string;
  groupId: string;
  chatId: string;
  argentinaDate: string;
  message: string;
  now?: number;
}): Promise<boolean> {
  if (!groupId || !chatId) throw new Error("Daily summary destination unavailable");
  const botId = resolveTelegramBotId();
  const identity = buildDailySummaryIdentity(botId, userId, argentinaDate);
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

  // The permanent parent is the dedupe receipt even after the delivery row's
  // 30-day TTL. An interrupted first insert can be completed during that TTL.
  const parent = await db.insert(telegram_operations).values({
      operation_id: identity.operationId,
      bot_id: botId,
      update_id: identity.updateId,
      operation_kind: DAILY_SUMMARY_OPERATION_KIND,
      status: "committed",
      resource_type: "daily_summary",
      resource_id: userId,
      result_json: JSON.stringify({ groupId }),
      created_at: now,
      updated_at: now,
      committed_at: now,
  }).onConflictDoNothing({ target: telegram_operations.operation_id })
    .returning({ operationId: telegram_operations.operation_id });
  if (parent.length === 0) {
    const [existing] = await db.select({
      kind: telegram_operations.operation_kind,
      createdAt: telegram_operations.created_at,
    }).from(telegram_operations).where(eq(telegram_operations.operation_id, identity.operationId)).limit(1);
    if (!existing || existing.kind !== DAILY_SUMMARY_OPERATION_KIND ||
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
