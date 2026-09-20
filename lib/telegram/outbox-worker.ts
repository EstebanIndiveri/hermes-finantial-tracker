import {
  claimTelegramDelivery,
  purgeExpiredTelegramDeliveries,
  type TelegramDeliveryRow,
} from "@/lib/telegram/outbox";
import {
  dispatchClaimedTelegramDelivery,
  type TelegramDispatchSummary,
} from "@/lib/telegram/outbox-dispatcher";

const MAX_WORKER_CLAIMS = 5;
const DEFAULT_WORKER_CLAIMS = 5;
const MAX_WORKER_BUDGET_MS = 55_000;
const DEFAULT_WORKER_BUDGET_MS = 45_000;
const MAX_WORKER_LEASE_MS = 60_000;
const DEFAULT_WORKER_LEASE_MS = 60_000;
const MAX_PURGE_ROWS = 100;
const DEFAULT_PURGE_ROWS = 100;
const MAX_PROVIDER_TIMEOUT_MS = 10_000;

export interface TelegramOutboxWorkerInput {
  botId: string;
  token?: string;
  now?: () => number;
  maxClaims?: number;
  budgetMs?: number;
  leaseMs?: number;
  purgeLimit?: number;
  monotonicNow?: () => number;
  fetchImpl?: typeof fetch;
}

export interface TelegramOutboxWorkerSummary extends TelegramDispatchSummary {
  claimed: number;
  purged: number;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(maximum, Math.floor(value)));
}

function emptySummary(): TelegramOutboxWorkerSummary {
  return { claimed: 0, sent: 0, retryable: 0, dead: 0, purged: 0 };
}

function addDispatchSummary(
  target: TelegramOutboxWorkerSummary,
  result: TelegramDispatchSummary,
): void {
  target.sent += result.sent;
  target.retryable += result.retryable;
  target.dead += result.dead;
}

/**
 * Processes due deliveries for one configured bot, serially and with hard
 * limits. Claiming is fenced by the lease token in outbox.ts; this worker
 * never invokes a financial writer.
 */
export async function runTelegramOutboxWorker({
  botId,
  token = process.env.TELEGRAM_BOT_TOKEN,
  now = Date.now,
  maxClaims = DEFAULT_WORKER_CLAIMS,
  budgetMs = DEFAULT_WORKER_BUDGET_MS,
  leaseMs = DEFAULT_WORKER_LEASE_MS,
  purgeLimit = DEFAULT_PURGE_ROWS,
  monotonicNow = () => performance.now(),
  fetchImpl = fetch,
}: TelegramOutboxWorkerInput): Promise<TelegramOutboxWorkerSummary> {
  if (!token || token.trim().length === 0) {
    throw new Error("Telegram outbox worker token is unavailable");
  }
  if (!botId || botId.trim().length === 0) {
    throw new Error("Telegram outbox worker bot id is unavailable");
  }

  const claimLimit = boundedInteger(maxClaims, DEFAULT_WORKER_CLAIMS, MAX_WORKER_CLAIMS);
  const runtimeBudget = boundedInteger(budgetMs, DEFAULT_WORKER_BUDGET_MS, MAX_WORKER_BUDGET_MS);
  const boundedLease = boundedInteger(leaseMs, DEFAULT_WORKER_LEASE_MS, MAX_WORKER_LEASE_MS);
  const boundedPurgeLimit = boundedInteger(purgeLimit, DEFAULT_PURGE_ROWS, MAX_PURGE_ROWS);
  const summary = emptySummary();
  const deadline = monotonicNow() + runtimeBudget;

  for (let index = 0; index < claimLimit; index += 1) {
    if (monotonicNow() >= deadline) break;

    const row: TelegramDeliveryRow | null = await claimTelegramDelivery({
      botId,
      now: now(),
      leaseMs: boundedLease,
    });
    if (!row) break;

    summary.claimed += 1;
    const remainingBudget = Math.max(1, Math.floor(deadline - monotonicNow()));
    const result = await dispatchClaimedTelegramDelivery({
      row,
      token,
      now,
      timeoutMs: Math.min(MAX_PROVIDER_TIMEOUT_MS, remainingBudget),
      fetchImpl,
    });
    addDispatchSummary(summary, result);
  }

  // Purge is opportunistic. Do not start extra DB work once the worker budget
  // is exhausted; the next cron run can safely continue terminal retention.
  if (monotonicNow() < deadline) {
    summary.purged = await purgeExpiredTelegramDeliveries({
      botId,
      now: now(),
      limit: boundedPurgeLimit,
    });
  }
  return summary;
}
