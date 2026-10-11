import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { LibSQLTransaction } from "drizzle-orm/libsql";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { pushDeliveryOutbox } from "@/lib/db/schema";

const EXPIRY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_LEASE_MS = 60_000;
const MAX_PURGE_ROWS = 100;
const ERROR_CODE = /^[a-z][a-z0-9_.-]{0,31}$/;

export type PushDeliveryEventType = "reimbursement.requested" | "reimbursement.paid";
export type PushDeliveryStatus = "pending" | "processing" | "retryable" | "sent" | "dead";
export type PushDeliveryRow = typeof pushDeliveryOutbox.$inferSelect;
export type PushDeliveryTransaction = LibSQLTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export interface BuildPushDeliveryInput {
  id?: string;
  operationId: string;
  deliveryKey: string;
  eventType: PushDeliveryEventType;
  reimbursementId: string;
  userId: string;
  subscriptionId: string;
  now?: number;
}

export interface ClaimPushDeliveryInput {
  id?: string;
  now?: number;
  leaseMs?: number;
  leaseToken?: string;
}

export interface FinishPushDeliveryInput {
  id: string;
  leaseToken: string;
  now?: number;
}

export interface RetryPushDeliveryInput extends FinishPushDeliveryInput {
  errorCode: string;
  httpStatus?: number;
  retryAt: number;
}

export interface DeadPushDeliveryInput extends FinishPushDeliveryInput {
  errorCode: string;
  httpStatus?: number;
}

function requireValue(name: string, value: string): void {
  if (!value || value.trim().length === 0) throw new Error(`${name} is required`);
}

function timestamp(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`);
  return value;
}

function stableErrorCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  return ERROR_CODE.test(normalized) ? normalized : "unknown";
}

function duration(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : fallback;
}

/** Builds metadata only; payload, endpoint, and financial/PII content are intentionally absent. */
export function buildPushDeliveryRow(input: BuildPushDeliveryInput) {
  requireValue("operationId", input.operationId);
  requireValue("deliveryKey", input.deliveryKey);
  requireValue("reimbursementId", input.reimbursementId);
  requireValue("userId", input.userId);
  requireValue("subscriptionId", input.subscriptionId);
  if (input.eventType !== "reimbursement.requested" && input.eventType !== "reimbursement.paid") {
    throw new Error("Unsupported push delivery event type");
  }
  const now = timestamp("now", input.now ?? Date.now());
  return {
    id: input.id ?? randomUUID(),
    operationId: input.operationId,
    deliveryKey: input.deliveryKey,
    eventType: input.eventType,
    reimbursementId: input.reimbursementId,
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    status: "pending" as const,
    attemptCount: 0,
    nextAttemptAt: now,
    leaseToken: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
    lastHttpStatus: null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    expiresAt: now + EXPIRY_MS,
    retentionUntil: now + RETENTION_MS,
  };
}

/** Enqueue inside the caller's financial transaction; repeated keys return the original row. */
export async function enqueuePushDelivery(
  tx: PushDeliveryTransaction,
  input: BuildPushDeliveryInput,
): Promise<PushDeliveryRow> {
  const values = buildPushDeliveryRow(input);
  const inserted = await tx.insert(pushDeliveryOutbox).values(values).onConflictDoNothing({
    target: pushDeliveryOutbox.deliveryKey,
  }).returning();
  if (inserted[0]) return inserted[0];
  const [existing] = await tx.select().from(pushDeliveryOutbox)
    .where(eq(pushDeliveryOutbox.deliveryKey, input.deliveryKey)).limit(1);
  if (!existing) throw new Error("Push delivery conflict could not be recovered");
  if (existing.operationId !== input.operationId || existing.eventType !== input.eventType ||
      existing.reimbursementId !== input.reimbursementId || existing.userId !== input.userId ||
      existing.subscriptionId !== input.subscriptionId) {
    throw new Error("Push delivery key collision has different delivery identity");
  }
  return existing;
}

function dueCondition(now: number) {
  return or(
    and(inArray(pushDeliveryOutbox.status, ["pending", "retryable"]), lte(pushDeliveryOutbox.nextAttemptAt, now), sql`${pushDeliveryOutbox.expiresAt} > ${now}`),
    and(eq(pushDeliveryOutbox.status, "processing"), lte(pushDeliveryOutbox.leaseExpiresAt, now), sql`${pushDeliveryOutbox.expiresAt} > ${now}`),
  );
}

export async function claimPushDelivery({ id, now = Date.now(), leaseMs, leaseToken = randomUUID() }: ClaimPushDeliveryInput = {}): Promise<PushDeliveryRow | null> {
  timestamp("now", now);
  if (leaseMs !== undefined && (!Number.isSafeInteger(leaseMs) || leaseMs <= 0)) throw new Error("leaseMs must be a positive safe integer");
  const filters = [dueCondition(now)];
  if (id) filters.push(eq(pushDeliveryOutbox.id, id));
  const [candidate] = await db.select({ id: pushDeliveryOutbox.id }).from(pushDeliveryOutbox)
    .where(and(...filters)).orderBy(asc(pushDeliveryOutbox.nextAttemptAt), asc(pushDeliveryOutbox.createdAt)).limit(1);
  if (!candidate) return null;
  const claimed = await db.update(pushDeliveryOutbox).set({
    status: "processing",
    attemptCount: sql`${pushDeliveryOutbox.attemptCount} + 1`,
    leaseToken,
    leaseExpiresAt: now + duration(leaseMs, DEFAULT_LEASE_MS),
    updatedAt: now,
    lastErrorCode: null,
    lastHttpStatus: null,
  }).where(and(eq(pushDeliveryOutbox.id, candidate.id), dueCondition(now))).returning();
  return claimed[0] ?? null;
}

export async function markPushDeliverySent({ id, leaseToken, now = Date.now() }: FinishPushDeliveryInput): Promise<boolean> {
  timestamp("now", now);
  const changed = await db.update(pushDeliveryOutbox).set({ status: "sent", leaseToken: null, leaseExpiresAt: null, lastErrorCode: null, lastHttpStatus: null, updatedAt: now, sentAt: now })
    .where(and(eq(pushDeliveryOutbox.id, id), eq(pushDeliveryOutbox.status, "processing"), eq(pushDeliveryOutbox.leaseToken, leaseToken))).returning({ id: pushDeliveryOutbox.id });
  return changed.length === 1;
}

export async function markPushDeliveryRetryable({ id, leaseToken, errorCode, httpStatus, retryAt, now = Date.now() }: RetryPushDeliveryInput): Promise<boolean> {
  timestamp("now", now);
  timestamp("retryAt", retryAt);
  const row = await db.select({ expiresAt: pushDeliveryOutbox.expiresAt }).from(pushDeliveryOutbox).where(and(eq(pushDeliveryOutbox.id, id), eq(pushDeliveryOutbox.status, "processing"), eq(pushDeliveryOutbox.leaseToken, leaseToken))).limit(1);
  if (!row[0]) return false;
  const retryable = Math.max(now, Math.min(retryAt, row[0].expiresAt - 1));
  if (now >= row[0].expiresAt || retryAt >= row[0].expiresAt) return markPushDeliveryDead({ id, leaseToken, errorCode, httpStatus, now });
  const changed = await db.update(pushDeliveryOutbox).set({ status: "retryable", nextAttemptAt: retryable, leaseToken: null, leaseExpiresAt: null, lastErrorCode: stableErrorCode(errorCode), lastHttpStatus: httpStatus ?? null, updatedAt: now, sentAt: null })
    .where(and(eq(pushDeliveryOutbox.id, id), eq(pushDeliveryOutbox.status, "processing"), eq(pushDeliveryOutbox.leaseToken, leaseToken))).returning({ id: pushDeliveryOutbox.id });
  return changed.length === 1;
}

export async function markPushDeliveryDead({ id, leaseToken, errorCode, httpStatus, now = Date.now() }: DeadPushDeliveryInput): Promise<boolean> {
  timestamp("now", now);
  const changed = await db.update(pushDeliveryOutbox).set({ status: "dead", leaseToken: null, leaseExpiresAt: null, lastErrorCode: stableErrorCode(errorCode), lastHttpStatus: httpStatus ?? null, updatedAt: now, sentAt: null })
    .where(and(eq(pushDeliveryOutbox.id, id), eq(pushDeliveryOutbox.status, "processing"), eq(pushDeliveryOutbox.leaseToken, leaseToken))).returning({ id: pushDeliveryOutbox.id });
  return changed.length === 1;
}

export async function purgeExpiredPushDeliveries({ now = Date.now(), limit = MAX_PURGE_ROWS }: { now?: number; limit?: number } = {}): Promise<number> {
  timestamp("now", now);
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("limit must be a non-negative safe integer");
  const boundedLimit = Math.min(MAX_PURGE_ROWS, limit);
  if (boundedLimit === 0) return 0;
  const expired = await db.select({ id: pushDeliveryOutbox.id }).from(pushDeliveryOutbox)
    .where(and(inArray(pushDeliveryOutbox.status, ["sent", "dead"]), lte(pushDeliveryOutbox.retentionUntil, now)))
    .orderBy(asc(pushDeliveryOutbox.retentionUntil), asc(pushDeliveryOutbox.updatedAt)).limit(boundedLimit);
  if (expired.length === 0) return 0;
  const deleted = await db.delete(pushDeliveryOutbox).where(and(inArray(pushDeliveryOutbox.id, expired.map((row) => row.id)), inArray(pushDeliveryOutbox.status, ["sent", "dead"]), lte(pushDeliveryOutbox.retentionUntil, now))).returning({ id: pushDeliveryOutbox.id });
  return deleted.length;
}

/** Fences expired non-terminal rows into dead so an expired intent cannot linger indefinitely. */
export async function sweepExpiredPushDeliveries({ now = Date.now(), limit = MAX_PURGE_ROWS }: { now?: number; limit?: number } = {}): Promise<number> {
  timestamp("now", now);
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("limit must be a non-negative safe integer");
  const boundedLimit = Math.min(MAX_PURGE_ROWS, limit);
  if (boundedLimit === 0) return 0;
  const expired = await db.select({ id: pushDeliveryOutbox.id }).from(pushDeliveryOutbox)
    .where(and(inArray(pushDeliveryOutbox.status, ["pending", "retryable", "processing"]), lte(pushDeliveryOutbox.expiresAt, now)))
    .orderBy(asc(pushDeliveryOutbox.expiresAt), asc(pushDeliveryOutbox.updatedAt)).limit(boundedLimit);
  if (expired.length === 0) return 0;
  const changed = await db.update(pushDeliveryOutbox).set({
    status: "dead", leaseToken: null, leaseExpiresAt: null, lastErrorCode: "expired", lastHttpStatus: null, updatedAt: now, sentAt: null,
  }).where(and(inArray(pushDeliveryOutbox.id, expired.map((row) => row.id)), inArray(pushDeliveryOutbox.status, ["pending", "retryable", "processing"]), lte(pushDeliveryOutbox.expiresAt, now))).returning({ id: pushDeliveryOutbox.id });
  return changed.length;
}
