import { randomUUID } from "node:crypto";
import { and, eq, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { telegram_update_inbox } from "@/lib/db/schema";

const DEFAULT_LEASE_MS = 120_000;
const SINGLE_BOT_FALLBACK = "telegram-single-bot";
const SAFE_BOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type TelegramUpdateClaim =
  | {
      kind: "acquired";
      leaseToken: string;
      attempt: number;
      leaseExpiresAt: number;
    }
  | { kind: "completed" }
  | { kind: "busy" };

export interface ClaimTelegramUpdateInput {
  botId: string;
  updateId: string;
  updateKind: string;
  now?: number;
  leaseMs?: number;
  leaseToken?: string;
}

export interface CompleteTelegramUpdateInput {
  botId: string;
  updateId: string;
  leaseToken: string;
  now?: number;
}

export interface FailTelegramUpdateInput {
  botId: string;
  updateId: string;
  leaseToken: string;
  errorCode?: string;
  now?: number;
}

/**
 * Resolves a stable bot namespace without persisting the bot token itself.
 * Telegram bot tokens start with a numeric bot id followed by a colon.
 */
export function resolveTelegramBotId(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.TELEGRAM_BOT_ID?.trim();
  if (configured) {
    if (!SAFE_BOT_ID.test(configured)) {
      throw new Error("TELEGRAM_BOT_ID must be a non-secret stable identifier");
    }
    return configured;
  }

  const tokenPrefix = env.TELEGRAM_BOT_TOKEN?.match(/^(\d+):/)?.[1];
  if (tokenPrefix) return tokenPrefix;

  if (env.NODE_ENV === "production") {
    throw new Error("A stable Telegram bot id is required when the inbox is enabled");
  }
  return SINGLE_BOT_FALLBACK;
}

function sanitizeErrorCode(errorCode?: string): string | null {
  if (errorCode === undefined) return null;

  const normalized = errorCode.trim().toLowerCase();
  // Stable machine codes only: reject spaces, punctuation, newlines and
  // exception text rather than persisting an arbitrary provider message.
  if (!/^[a-z][a-z0-9_.-]{0,31}$/.test(normalized)) return "unknown";
  return normalized;
}

function leaseDuration(leaseMs?: number): number {
  return Number.isFinite(leaseMs) && (leaseMs as number) > 0
    ? Math.floor(leaseMs as number)
    : DEFAULT_LEASE_MS;
}

function attemptNumber(value: number | null | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Atomically acquires ownership of a Telegram update.
 *
 * Each write is an atomic autocommit operation. The unique key makes the
 * insert the first claim, and the conditional update makes reclaiming a
 * retryable/expired row a single-winner operation. A caller must not run a
 * read-before-insert deduplication guard.
 */
export async function claimTelegramUpdate({
  botId,
  updateId,
  updateKind,
  now = Date.now(),
  leaseMs,
  leaseToken = randomUUID(),
}: ClaimTelegramUpdateInput): Promise<TelegramUpdateClaim> {
  const expiresAt = now + leaseDuration(leaseMs);

  const inserted = await db
      .insert(telegram_update_inbox)
      .values({
        id: randomUUID(),
        bot_id: botId,
        update_id: updateId,
        update_kind: updateKind,
        status: "processing",
        attempt_count: 1,
        lease_token: leaseToken,
        lease_expires_at: expiresAt,
        last_error_code: null,
        received_at: now,
        updated_at: now,
        completed_at: null,
      })
      .onConflictDoNothing({
        target: [telegram_update_inbox.bot_id, telegram_update_inbox.update_id],
      })
      .returning({
        attempt: telegram_update_inbox.attempt_count,
        leaseExpiresAt: telegram_update_inbox.lease_expires_at,
      });

  if (inserted.length > 0) {
    return {
      kind: "acquired" as const,
      leaseToken,
      attempt: attemptNumber(inserted[0].attempt),
      leaseExpiresAt: inserted[0].leaseExpiresAt ?? expiresAt,
    };
  }

  const reclaimed = await db
      .update(telegram_update_inbox)
      .set({
        status: "processing",
        attempt_count: sql`${telegram_update_inbox.attempt_count} + 1`,
        lease_token: leaseToken,
        lease_expires_at: expiresAt,
        last_error_code: null,
        updated_at: now,
        completed_at: null,
      })
      .where(
        and(
          eq(telegram_update_inbox.bot_id, botId),
          eq(telegram_update_inbox.update_id, updateId),
          or(
            eq(telegram_update_inbox.status, "retryable"),
            and(
              eq(telegram_update_inbox.status, "processing"),
              lte(telegram_update_inbox.lease_expires_at, now),
            ),
          ),
        ),
      )
      .returning({
        attempt: telegram_update_inbox.attempt_count,
        leaseExpiresAt: telegram_update_inbox.lease_expires_at,
      });

  if (reclaimed.length > 0) {
    return {
      kind: "acquired" as const,
      leaseToken,
      attempt: attemptNumber(reclaimed[0].attempt),
      leaseExpiresAt: reclaimed[0].leaseExpiresAt ?? expiresAt,
    };
  }

  const [existing] = await db
      .select({
        status: telegram_update_inbox.status,
        leaseExpiresAt: telegram_update_inbox.lease_expires_at,
      })
      .from(telegram_update_inbox)
      .where(
        and(
          eq(telegram_update_inbox.bot_id, botId),
          eq(telegram_update_inbox.update_id, updateId),
        ),
      )
      .limit(1);

  return existing?.status === "completed"
    ? { kind: "completed" as const }
    : { kind: "busy" as const };
}

export async function completeTelegramUpdate({
  botId,
  updateId,
  leaseToken,
  now = Date.now(),
}: CompleteTelegramUpdateInput): Promise<boolean> {
  const changed = await db
    .update(telegram_update_inbox)
    .set({
      status: "completed",
      lease_token: null,
      lease_expires_at: null,
      last_error_code: null,
      updated_at: now,
      completed_at: now,
    })
    .where(
      and(
        eq(telegram_update_inbox.bot_id, botId),
        eq(telegram_update_inbox.update_id, updateId),
        eq(telegram_update_inbox.status, "processing"),
        eq(telegram_update_inbox.lease_token, leaseToken),
      ),
    )
    .returning({ id: telegram_update_inbox.id });

  return changed.length === 1;
}

export async function failTelegramUpdate({
  botId,
  updateId,
  leaseToken,
  errorCode,
  now = Date.now(),
}: FailTelegramUpdateInput): Promise<boolean> {
  const changed = await db
    .update(telegram_update_inbox)
    .set({
      status: "retryable",
      lease_token: null,
      lease_expires_at: null,
      last_error_code: sanitizeErrorCode(errorCode),
      updated_at: now,
      completed_at: null,
    })
    .where(
      and(
        eq(telegram_update_inbox.bot_id, botId),
        eq(telegram_update_inbox.update_id, updateId),
        eq(telegram_update_inbox.status, "processing"),
        eq(telegram_update_inbox.lease_token, leaseToken),
      ),
    )
    .returning({ id: telegram_update_inbox.id });

  return changed.length === 1;
}
