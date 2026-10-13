import webPush from "web-push";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { group_members, pushSubscriptions, reimbursementRequests, transactions } from "@/lib/db/schema";
import { isPushCanaryEnabled, isPushCanaryTarget } from "@/lib/notifications/push-canary";
import {
  claimPushDelivery,
  markPushDeliveryDead,
  markPushDeliveryRetryable,
  markPushDeliverySent,
  purgeExpiredPushDeliveries,
  sweepExpiredPushDeliveries,
  type PushDeliveryRow,
} from "@/lib/notifications/push-outbox";

const DEFAULT_MAX_CLAIMS = 25;
const DEFAULT_MAX_RUNTIME_MS = 10_000;
const LEASE_MS = 60_000;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 60 * 60 * 1_000;
const PROVIDER_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 8;
const PUSH_URL = "/dashboard/reimbursements";
const PUSH_PAYLOAD = JSON.stringify({
  title: "Reintegros",
  body: "Tenés una actualización de reintegros.",
  url: PUSH_URL,
});

export interface PushOutboxWorkerOptions {
  maxClaims?: number;
  maxRuntimeMs?: number;
  now?: () => number;
  monotonicNow?: () => number;
}

export interface PushOutboxWorkerResult {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  lostLease: number;
  swept: number;
  purged: number;
  skipped: boolean;
  budgetExhausted: boolean;
}

interface ProviderError {
  statusCode?: unknown;
}

function providerStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const status = (error as ProviderError).statusCode;
  return typeof status === "number" ? status : undefined;
}

function retryDelay(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 10));
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** exponent);
}

async function isEligible(row: PushDeliveryRow): Promise<boolean> {
  const [reimbursement] = await db.select({
    id: reimbursementRequests.id,
    status: reimbursementRequests.status,
    requesterId: reimbursementRequests.requesterId,
    payerId: reimbursementRequests.payerId,
    groupId: transactions.group_id,
    transactionStatus: transactions.status,
    deletedAt: transactions.deleted_at,
  }).from(reimbursementRequests)
    .innerJoin(transactions, eq(reimbursementRequests.transactionId, transactions.id))
    .where(eq(reimbursementRequests.id, row.reimbursementId)).limit(1);
  if (!reimbursement || !isPushCanaryTarget(reimbursement.groupId, row.userId) ||
      reimbursement.transactionStatus !== "active" || reimbursement.deletedAt !== null) return false;

  const recipientIsCurrentMember = async (userId: string): Promise<boolean> => {
    const [membership] = await db.select({ userId: group_members.user_id })
      .from(group_members)
      .where(and(eq(group_members.group_id, reimbursement.groupId!), eq(group_members.user_id, userId)))
      .limit(1);
    return Boolean(membership);
  };

  if (row.eventType === "reimbursement.requested") {
    return reimbursement.status === "pending" && reimbursement.payerId === row.userId && reimbursement.requesterId !== row.userId && await recipientIsCurrentMember(row.userId);
  }
  return reimbursement.status === "paid" && reimbursement.requesterId === row.userId && await recipientIsCurrentMember(row.userId);
}

async function sendClaimed(row: PushDeliveryRow, now: number): Promise<"sent" | "retryable" | "dead" | "lostLease"> {
  if (!(await isEligible(row))) {
    return await markPushDeliveryDead({ id: row.id, leaseToken: row.leaseToken!, errorCode: "ineligible", now }) ? "dead" : "lostLease";
  }
  // Read ownership after all financial eligibility checks, immediately before provider delivery.
  const [subscription] = await db.select({
    endpoint: pushSubscriptions.endpoint,
    p256dhKey: pushSubscriptions.p256dhKey,
    authKey: pushSubscriptions.authKey,
  }).from(pushSubscriptions).where(and(
    eq(pushSubscriptions.id, row.subscriptionId),
    eq(pushSubscriptions.userId, row.userId),
  )).limit(1);
  if (!subscription) {
    return await markPushDeliveryDead({ id: row.id, leaseToken: row.leaseToken!, errorCode: "ineligible", now }) ? "dead" : "lostLease";
  }
  try {
    // A timeout only fences this worker; the provider promise cannot be cancelled.
    // Its eventual delivery may therefore race a later retry (at-least-once semantics).
    const providerCall = webPush.sendNotification({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
    }, PUSH_PAYLOAD);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        providerCall,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("provider timeout")), PROVIDER_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    return await markPushDeliverySent({ id: row.id, leaseToken: row.leaseToken!, now }) ? "sent" : "lostLease";
  } catch (error: unknown) {
    const status = providerStatus(error);
    if (status === 404 || status === 410) {
      await db.delete(pushSubscriptions).where(and(
        eq(pushSubscriptions.id, row.subscriptionId),
        eq(pushSubscriptions.userId, row.userId),
        eq(pushSubscriptions.endpoint, subscription.endpoint),
      ));
      return await markPushDeliveryDead({ id: row.id, leaseToken: row.leaseToken!, errorCode: "subscription_gone", httpStatus: status, now }) ? "dead" : "lostLease";
    }
    if (status === 429 || status === undefined || status >= 500) {
      const changed = await markPushDeliveryRetryable({
        id: row.id,
        leaseToken: row.leaseToken!,
        errorCode: status === 429 ? "provider_rate_limited" : "provider_unavailable",
        httpStatus: status,
        retryAt: now + retryDelay(row.attemptCount),
        now,
      });
      return changed ? "retryable" : "lostLease";
    }
    return await markPushDeliveryDead({ id: row.id, leaseToken: row.leaseToken!, errorCode: "provider_rejected", httpStatus: status, now }) ? "dead" : "lostLease";
  }
}

export async function processPushOutbox(options: PushOutboxWorkerOptions = {}): Promise<PushOutboxWorkerResult> {
  if (!isPushCanaryEnabled()) {
    return { claimed: 0, sent: 0, retried: 0, dead: 0, lostLease: 0, swept: 0, purged: 0, skipped: true, budgetExhausted: false };
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { claimed: 0, sent: 0, retried: 0, dead: 0, lostLease: 0, swept: 0, purged: 0, skipped: true, budgetExhausted: false };
  webPush.setVapidDetails("mailto:admin@hermes.app", publicKey, privateKey);

  const nowFn = options.now ?? Date.now;
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  if (options.maxClaims !== undefined && (!Number.isSafeInteger(options.maxClaims) || options.maxClaims < 0)) throw new Error("maxClaims must be a non-negative safe integer");
  if (options.maxRuntimeMs !== undefined && (!Number.isSafeInteger(options.maxRuntimeMs) || options.maxRuntimeMs <= 0)) throw new Error("maxRuntimeMs must be a positive safe integer");
  const maxClaims = Math.min(DEFAULT_MAX_CLAIMS, options.maxClaims ?? DEFAULT_MAX_CLAIMS);
  const runtimeMs = Math.min(DEFAULT_MAX_RUNTIME_MS, options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS);
  const deadline = monotonicNow() + runtimeMs;
  const result: PushOutboxWorkerResult = { claimed: 0, sent: 0, retried: 0, dead: 0, lostLease: 0, swept: 0, purged: 0, skipped: false, budgetExhausted: false };
  if (monotonicNow() >= deadline) {
    result.budgetExhausted = true;
    return result;
  }
  result.swept = await sweepExpiredPushDeliveries({ now: nowFn(), limit: 100 });
  if (monotonicNow() >= deadline) {
    result.budgetExhausted = true;
    return result;
  }
  result.purged = await purgeExpiredPushDeliveries({ now: nowFn(), limit: 100 });
  while (result.claimed < maxClaims) {
    if (monotonicNow() >= deadline) {
      result.budgetExhausted = true;
      break;
    }
    const row = await claimPushDelivery({ now: nowFn(), leaseMs: LEASE_MS });
    if (!row) break;
    result.claimed += 1;
    if (row.attemptCount > MAX_ATTEMPTS) {
      const changed = await markPushDeliveryDead({ id: row.id, leaseToken: row.leaseToken!, errorCode: "attempts_exhausted", now: nowFn() });
      if (changed) result.dead += 1;
      else result.lostLease += 1;
      continue;
    }
    const outcome = await sendClaimed(row, nowFn());
    result[outcome === "retryable" ? "retried" : outcome] += 1;
  }
  result.budgetExhausted ||= monotonicNow() >= deadline;
  return result;
}

export const runPushOutboxWorker = processPushOutbox;
