import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { telegram_delivery_outbox, telegram_operations } from "@/lib/db/schema";

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_RETENTION_PURGE_ROWS = 100;
const ERROR_CODE = /^[a-z][a-z0-9_.-]{0,31}$/;
const MAX_REPLY_MARKUP_BYTES = 16_384;

export type TelegramDeliveryAction = "send_message" | "edit_message";

export interface TelegramDeliveryEnvelope {
  text: string;
  replyMarkup?: Record<string, unknown>;
  parseMode?: "HTML";
}

export interface EnqueueTelegramDeliveryInput extends TelegramDeliveryEnvelope {
  botId: string;
  updateId: string;
  operationId: string;
  deliveryKey: string;
  action: TelegramDeliveryAction;
  chatId: string;
  messageId?: number;
  now?: number;
  retentionMs?: number;
  id?: string;
}

export interface ClaimTelegramDeliveryInput {
  id?: string;
  botId?: string;
  updateId?: string;
  now?: number;
  leaseMs?: number;
  leaseToken?: string;
}

export interface FinishTelegramDeliveryInput {
  id: string;
  leaseToken: string;
  providerMessageId?: string;
  now?: number;
}

export interface RetryTelegramDeliveryInput extends FinishTelegramDeliveryInput {
  errorCode: string;
  httpStatus?: number;
  retryAt: number;
}

export interface DeadTelegramDeliveryInput extends FinishTelegramDeliveryInput {
  errorCode: string;
  httpStatus?: number;
}

export interface UpdateTelegramDeliveryEnvelopeInput extends TelegramDeliveryEnvelope {
  botId: string;
  operationId: string;
  deliveryKey: string;
  now?: number;
}

export type TelegramDeliveryRow = typeof telegram_delivery_outbox.$inferSelect;

export interface PurgeExpiredTelegramDeliveriesInput {
  botId: string;
  now?: number;
  limit?: number;
}

function positiveDuration(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.floor(value as number)
    : fallback;
}

function stableErrorCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  return ERROR_CODE.test(normalized) ? normalized : "unknown";
}

function validateEnvelope(input: TelegramDeliveryEnvelope): void {
  if (!input.text || input.text.length > 4096) {
    throw new Error("Telegram delivery text must contain between 1 and 4096 characters");
  }
  if (input.parseMode !== undefined && input.parseMode !== "HTML") {
    throw new Error("Unsupported Telegram parse mode");
  }
}

function encodeReplyMarkup(value: Record<string, unknown> | undefined): string | null {
  if (!value) return null;
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, "utf8") > MAX_REPLY_MARKUP_BYTES) {
    throw new Error("Telegram reply markup is too large");
  }
  return encoded;
}

export function buildTelegramDeliveryRow(input: EnqueueTelegramDeliveryInput) {
  validateEnvelope(input);
  if (input.action === "edit_message" && !Number.isSafeInteger(input.messageId)) {
    throw new Error("Telegram edit delivery requires a message id");
  }

  const now = input.now ?? Date.now();
  return {
    id: input.id ?? randomUUID(),
    bot_id: input.botId,
    update_id: input.updateId,
    operation_id: input.operationId,
    delivery_key: input.deliveryKey,
    action: input.action,
    chat_id: input.chatId,
    message_id: input.messageId ?? null,
    text: input.text,
    reply_markup_json: encodeReplyMarkup(input.replyMarkup),
    parse_mode: input.parseMode ?? "HTML",
    status: "pending" as const,
    attempt_count: 0,
    next_attempt_at: now,
    lease_token: null,
    lease_expires_at: null,
    provider_message_id: null,
    last_error_code: null,
    last_http_status: null,
    created_at: now,
    updated_at: now,
    sent_at: null,
    retention_until: now + positiveDuration(input.retentionMs, DEFAULT_RETENTION_MS),
  };
}

export async function enqueueTelegramDelivery(
  input: EnqueueTelegramDeliveryInput,
): Promise<TelegramDeliveryRow> {
  const inserted = await db
    .insert(telegram_delivery_outbox)
    .values(buildTelegramDeliveryRow(input))
    .onConflictDoNothing({
      target: [telegram_delivery_outbox.bot_id, telegram_delivery_outbox.delivery_key],
    })
    .returning();

  if (inserted[0]) return inserted[0];

  const [existing] = await db
    .select()
    .from(telegram_delivery_outbox)
    .where(
      and(
        eq(telegram_delivery_outbox.bot_id, input.botId),
        eq(telegram_delivery_outbox.delivery_key, input.deliveryKey),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Telegram delivery conflict could not be recovered");
  return existing;
}

export async function updateTelegramDeliveryEnvelope({
  botId,
  operationId,
  deliveryKey,
  text,
  replyMarkup,
  parseMode = "HTML",
  now = Date.now(),
}: UpdateTelegramDeliveryEnvelopeInput): Promise<number> {
  validateEnvelope({ text, replyMarkup, parseMode });
  const changed = await db
    .update(telegram_delivery_outbox)
    .set({
      text,
      reply_markup_json: encodeReplyMarkup(replyMarkup),
      parse_mode: parseMode,
      next_attempt_at: now,
      updated_at: now,
    })
    .where(and(
      eq(telegram_delivery_outbox.bot_id, botId),
      eq(telegram_delivery_outbox.operation_id, operationId),
      eq(telegram_delivery_outbox.delivery_key, deliveryKey),
      inArray(telegram_delivery_outbox.status, ["pending", "retryable"]),
    ))
    .returning({ id: telegram_delivery_outbox.id });
  return changed.length;
}

export async function hasRecoverableTelegramDeliveries(
  botId: string,
  updateId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: telegram_delivery_outbox.id })
    .from(telegram_delivery_outbox)
    .where(and(
      eq(telegram_delivery_outbox.bot_id, botId),
      eq(telegram_delivery_outbox.update_id, updateId),
      notInArray(telegram_delivery_outbox.status, ["sent", "dead"]),
    ))
    .limit(1);
  return Boolean(existing);
}

/**
 * Returns operations that own a durable delivery for an update, including
 * terminal deliveries. The webhook uses this to recover after a crash that
 * happened after provider delivery but before the inbox row was completed.
 */
export async function telegramDeliveryOperationKinds(
  botId: string,
  updateId: string,
): Promise<string[]> {
  const rows = await db
    .select({ kind: telegram_operations.operation_kind })
    .from(telegram_delivery_outbox)
    .innerJoin(
      telegram_operations,
      eq(telegram_delivery_outbox.operation_id, telegram_operations.operation_id),
    )
    .where(and(
      eq(telegram_delivery_outbox.bot_id, botId),
      eq(telegram_delivery_outbox.update_id, updateId),
    ));
  return [...new Set(rows.map((row) => row.kind))];
}

function dueCondition(now: number) {
  return or(
    and(
      inArray(telegram_delivery_outbox.status, ["pending", "retryable"]),
      lte(telegram_delivery_outbox.next_attempt_at, now),
    ),
    and(
      eq(telegram_delivery_outbox.status, "processing"),
      lte(telegram_delivery_outbox.lease_expires_at, now),
    ),
  );
}

export async function claimTelegramDelivery({
  id,
  botId,
  updateId,
  now = Date.now(),
  leaseMs,
  leaseToken = randomUUID(),
}: ClaimTelegramDeliveryInput = {}): Promise<TelegramDeliveryRow | null> {
  const filters = [dueCondition(now)];
  if (id) filters.push(eq(telegram_delivery_outbox.id, id));
  if (botId) filters.push(eq(telegram_delivery_outbox.bot_id, botId));
  if (updateId) filters.push(eq(telegram_delivery_outbox.update_id, updateId));

  const [candidate] = await db
    .select({ id: telegram_delivery_outbox.id })
    .from(telegram_delivery_outbox)
    .where(and(...filters))
    .orderBy(
      asc(telegram_delivery_outbox.next_attempt_at),
      asc(telegram_delivery_outbox.created_at),
    )
    .limit(1);

  if (!candidate) return null;

  const expiresAt = now + positiveDuration(leaseMs, DEFAULT_LEASE_MS);
  const claimed = await db
    .update(telegram_delivery_outbox)
    .set({
      status: "processing",
      attempt_count: sql`${telegram_delivery_outbox.attempt_count} + 1`,
      lease_token: leaseToken,
      lease_expires_at: expiresAt,
      updated_at: now,
      last_error_code: null,
      last_http_status: null,
    })
    .where(and(eq(telegram_delivery_outbox.id, candidate.id), dueCondition(now)))
    .returning();

  return claimed[0] ?? null;
}

export async function markTelegramDeliverySent({
  id,
  leaseToken,
  providerMessageId,
  now = Date.now(),
}: FinishTelegramDeliveryInput): Promise<boolean> {
  const changed = await db
    .update(telegram_delivery_outbox)
    .set({
      status: "sent",
      lease_token: null,
      lease_expires_at: null,
      last_error_code: null,
      last_http_status: null,
      provider_message_id: providerMessageId ?? null,
      updated_at: now,
      sent_at: now,
    })
    .where(
      and(
        eq(telegram_delivery_outbox.id, id),
        eq(telegram_delivery_outbox.status, "processing"),
        eq(telegram_delivery_outbox.lease_token, leaseToken),
      ),
    )
    .returning({ id: telegram_delivery_outbox.id });
  return changed.length === 1;
}

export async function markTelegramDeliveryRetryable({
  id,
  leaseToken,
  errorCode,
  httpStatus,
  retryAt,
  now = Date.now(),
}: RetryTelegramDeliveryInput): Promise<boolean> {
  const changed = await db
    .update(telegram_delivery_outbox)
    .set({
      status: "retryable",
      next_attempt_at: Math.max(now, retryAt),
      lease_token: null,
      lease_expires_at: null,
      last_error_code: stableErrorCode(errorCode),
      last_http_status: httpStatus ?? null,
      updated_at: now,
      sent_at: null,
    })
    .where(
      and(
        eq(telegram_delivery_outbox.id, id),
        eq(telegram_delivery_outbox.status, "processing"),
        eq(telegram_delivery_outbox.lease_token, leaseToken),
      ),
    )
    .returning({ id: telegram_delivery_outbox.id });
  return changed.length === 1;
}

export async function markTelegramDeliveryDead({
  id,
  leaseToken,
  errorCode,
  httpStatus,
  now = Date.now(),
}: DeadTelegramDeliveryInput): Promise<boolean> {
  const changed = await db
    .update(telegram_delivery_outbox)
    .set({
      status: "dead",
      lease_token: null,
      lease_expires_at: null,
      last_error_code: stableErrorCode(errorCode),
      last_http_status: httpStatus ?? null,
      updated_at: now,
      sent_at: null,
    })
    .where(
      and(
        eq(telegram_delivery_outbox.id, id),
        eq(telegram_delivery_outbox.status, "processing"),
        eq(telegram_delivery_outbox.lease_token, leaseToken),
      ),
    )
    .returning({ id: telegram_delivery_outbox.id });
  return changed.length === 1;
}

/**
 * Removes only terminal deliveries whose explicit retention window expired.
 * The predicates are repeated on DELETE so a concurrent worker cannot cause
 * this operation to remove a row that became non-terminal between the read
 * and delete statements.
 */
export async function purgeExpiredTelegramDeliveries({
  botId,
  now = Date.now(),
  limit = MAX_RETENTION_PURGE_ROWS,
}: PurgeExpiredTelegramDeliveriesInput): Promise<number> {
  if (!botId || botId.trim().length === 0) {
    throw new Error("Telegram retention purge requires a bot id");
  }
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.min(MAX_RETENTION_PURGE_ROWS, Math.floor(limit)))
    : MAX_RETENTION_PURGE_ROWS;
  if (boundedLimit === 0) return 0;

  const expired = await db
    .select({ id: telegram_delivery_outbox.id })
    .from(telegram_delivery_outbox)
    .where(and(
      eq(telegram_delivery_outbox.bot_id, botId),
      inArray(telegram_delivery_outbox.status, ["sent", "dead"]),
      lte(telegram_delivery_outbox.retention_until, now),
    ))
    .orderBy(
      asc(telegram_delivery_outbox.retention_until),
      asc(telegram_delivery_outbox.updated_at),
    )
    .limit(boundedLimit);

  if (expired.length === 0) return 0;

  const deleted = await db
    .delete(telegram_delivery_outbox)
    .where(and(
      eq(telegram_delivery_outbox.bot_id, botId),
      inArray(telegram_delivery_outbox.id, expired.map((row) => row.id)),
      inArray(telegram_delivery_outbox.status, ["sent", "dead"]),
      lte(telegram_delivery_outbox.retention_until, now),
    ))
    .returning({ id: telegram_delivery_outbox.id });

  return deleted.length;
}
