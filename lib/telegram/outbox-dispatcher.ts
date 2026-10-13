import {
  claimTelegramDelivery,
  markTelegramDeliveryDead,
  markTelegramDeliveryRetryable,
  markTelegramDeliverySent,
  type TelegramDeliveryRow,
} from "@/lib/telegram/outbox";
import { db } from "@/lib/db/client";
import { telegram_operations, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasProactiveConsent } from "@/lib/notifications/proactive-consent";
import { DAILY_SUMMARY_OPERATION_KIND, parseDailySummaryContext } from "@/lib/notifications/daily-summary-delivery";
import { resolveAuthorizedTelegramGroup } from "@/lib/telegram/authorized-group-context";
import { isDailySummaryRecipientAllowed } from "@/lib/notifications/daily-summary-canary";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const MAX_ATTEMPTS = 8;
const MAX_INLINE_DELIVERIES = 10;
const REQUEST_TIMEOUT_MS = 10_000;

interface TelegramProviderBody {
  ok?: boolean;
  description?: string;
  result?: { message_id?: number };
  parameters?: { retry_after?: number };
}

export interface DispatchTelegramUpdateInput {
  botId: string;
  updateId: string;
  now?: () => number;
  maxDeliveries?: number;
  token?: string;
  fetchImpl?: typeof fetch;
}

export interface TelegramDispatchSummary {
  sent: number;
  retryable: number;
  dead: number;
  lostLease: number;
}

export interface DispatchClaimedTelegramDeliveryInput {
  row: TelegramDeliveryRow;
  now?: () => number;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function decodeReplyMarkup(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_reply_markup");
  }
  return parsed as Record<string, unknown>;
}

function retryDelayMs(attempt: number): number {
  return Math.min(15 * 60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

async function dailySummaryRejection(row: TelegramDeliveryRow): Promise<string | null> {
  const [operation] = await db.select({
    botId: telegram_operations.bot_id,
    updateId: telegram_operations.update_id,
    kind: telegram_operations.operation_kind,
    status: telegram_operations.status,
    resourceType: telegram_operations.resource_type,
    userId: telegram_operations.resource_id,
    context: telegram_operations.result_json,
  }).from(telegram_operations).where(eq(telegram_operations.operation_id, row.operation_id)).limit(1);
  if (!operation || operation.botId !== row.bot_id || operation.updateId !== row.update_id ||
    operation.kind !== DAILY_SUMMARY_OPERATION_KIND || operation.status !== "committed" ||
    operation.resourceType !== "daily_summary" || !operation.userId) return "invalid_proactive_context";
  const context = parseDailySummaryContext(operation.context);
  if (!context || row.action !== "send_message") return "invalid_proactive_context";
  if (!isDailySummaryRecipientAllowed(operation.userId, context.groupId)) return "notifications_disabled";
  if (!await hasProactiveConsent(operation.userId, "dailySummary")) return "consent_revoked";
  const [user] = await db.select({
    telegramId: users.telegram_user_id,
    activeGroupId: users.active_telegram_group_id,
  }).from(users).where(eq(users.id, operation.userId)).limit(1);
  if (!user || user.telegramId !== row.chat_id) return "recipient_changed";
  const authorizedGroupId = await resolveAuthorizedTelegramGroup(operation.userId, user.activeGroupId);
  if (authorizedGroupId !== context.groupId) return "group_changed";
  return null;
}

function providerBody(value: unknown): TelegramProviderBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as TelegramProviderBody;
}

async function parseProviderBody(response: Response): Promise<TelegramProviderBody> {
  try {
    return providerBody(await response.json());
  } catch {
    return {};
  }
}

async function deliver(
  row: TelegramDeliveryRow,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<
  | { kind: "sent"; providerMessageId?: string }
  | { kind: "retryable"; errorCode: string; httpStatus?: number; retryAfterMs?: number }
  | { kind: "dead"; errorCode: string; httpStatus?: number }
> {
  let replyMarkup: Record<string, unknown> | undefined;
  try {
    replyMarkup = decodeReplyMarkup(row.reply_markup_json);
  } catch {
    return { kind: "dead", errorCode: "invalid_payload" };
  }

  const method = row.action === "edit_message" ? "editMessageText" : "sendMessage";
  const payload: Record<string, unknown> = {
    chat_id: row.chat_id,
    text: row.text,
    parse_mode: row.parse_mode,
  };
  if (row.action === "edit_message") payload.message_id = row.message_id;
  if (replyMarkup) payload.reply_markup = replyMarkup;

  let response: Response;
  try {
    response = await fetchImpl(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { kind: "retryable", errorCode: "network_error" };
  }

  const body = await parseProviderBody(response);
  if (response.ok && body.ok !== false) {
    const messageId = body.result?.message_id;
    return {
      kind: "sent",
      ...(Number.isSafeInteger(messageId) ? { providerMessageId: String(messageId) } : {}),
    };
  }

  const description = body.description?.toLowerCase() ?? "";
  if (
    row.action === "edit_message" &&
    response.status === 400 &&
    description.includes("message is not modified")
  ) {
    return { kind: "sent" };
  }

  if (response.status === 429) {
    const retryAfter = body.parameters?.retry_after;
    return {
      kind: "retryable",
      errorCode: "rate_limited",
      httpStatus: response.status,
      retryAfterMs: Number.isFinite(retryAfter) ? Math.max(0, Number(retryAfter) * 1_000) : undefined,
    };
  }
  if (response.status >= 500) {
    return { kind: "retryable", errorCode: "provider_unavailable", httpStatus: response.status };
  }
  return { kind: "dead", errorCode: "provider_rejected", httpStatus: response.status };
}

/**
 * Dispatches exactly one row that is already owned by this process. Both the
 * inline update path and the global worker use this function so provider
 * classification and retry/dead transitions cannot drift apart.
 */
export async function dispatchClaimedTelegramDelivery({
  row,
  now = Date.now,
  token = process.env.TELEGRAM_BOT_TOKEN,
  timeoutMs = REQUEST_TIMEOUT_MS,
  fetchImpl = fetch,
}: DispatchClaimedTelegramDeliveryInput): Promise<TelegramDispatchSummary> {
  const summary: TelegramDispatchSummary = { sent: 0, retryable: 0, dead: 0, lostLease: 0 };
  const leaseToken = row.lease_token;
  if (!leaseToken) throw new Error("Claimed Telegram delivery has no lease token");

  const claimedAt = now();
  const isDailySummary = row.update_id.startsWith("cron:daily:");
  if (isDailySummary) {
    // A recovered lease may follow a provider-accepted request whose response
    // never reached us. Do not call sendMessage twice for this beta alert.
    const rejection = row.attempt_count > 1
      ? "delivery_uncertain"
      : await dailySummaryRejection(row);
    if (rejection) {
      const changed = await markTelegramDeliveryDead({
        id: row.id,
        leaseToken,
        errorCode: rejection,
        now: claimedAt,
      });
      summary[changed ? "dead" : "lostLease"] += 1;
      return summary;
    }
  }
  if (!token) {
    if (isDailySummary) {
      const changed = await markTelegramDeliveryDead({
        id: row.id,
        leaseToken,
        errorCode: "missing_token",
        now: claimedAt,
      });
      summary[changed ? "dead" : "lostLease"] += 1;
      return summary;
    }
    const changed = await markTelegramDeliveryRetryable({
      id: row.id,
      leaseToken,
      errorCode: "missing_token",
      retryAt: claimedAt + retryDelayMs(row.attempt_count),
      now: claimedAt,
    });
    summary[changed ? "retryable" : "lostLease"] += 1;
    return summary;
  }

  const boundedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.min(REQUEST_TIMEOUT_MS, Math.floor(timeoutMs)))
    : REQUEST_TIMEOUT_MS;
  const result = await deliver(row, token, fetchImpl, boundedTimeoutMs);
  if (result.kind === "sent") {
    const changed = await markTelegramDeliverySent({
      id: row.id,
      leaseToken,
      providerMessageId: result.providerMessageId,
      now: now(),
    });
    summary[changed ? "sent" : "lostLease"] += 1;
    return summary;
  }

  if (isDailySummary) {
    const changed = await markTelegramDeliveryDead({
      id: row.id,
      leaseToken,
      errorCode: result.kind === "retryable" ? "delivery_uncertain" : result.errorCode,
      httpStatus: result.httpStatus,
      now: now(),
    });
    summary[changed ? "dead" : "lostLease"] += 1;
    return summary;
  }

  if (result.kind === "retryable" && row.attempt_count < MAX_ATTEMPTS) {
    const finishedAt = now();
    const changed = await markTelegramDeliveryRetryable({
      id: row.id,
      leaseToken,
      errorCode: result.errorCode,
      httpStatus: result.httpStatus,
      retryAt: finishedAt + (result.retryAfterMs ?? retryDelayMs(row.attempt_count)),
      now: finishedAt,
    });
    summary[changed ? "retryable" : "lostLease"] += 1;
    return summary;
  }

  const changed = await markTelegramDeliveryDead({
    id: row.id,
    leaseToken,
    errorCode: result.kind === "retryable" ? "attempts_exhausted" : result.errorCode,
    httpStatus: result.httpStatus,
    now: now(),
  });
  summary[changed ? "dead" : "lostLease"] += 1;
  return summary;
}

export async function dispatchTelegramDeliveriesForUpdate({
  botId,
  updateId,
  now = Date.now,
  maxDeliveries = MAX_INLINE_DELIVERIES,
  token = process.env.TELEGRAM_BOT_TOKEN,
  fetchImpl = fetch,
}: DispatchTelegramUpdateInput): Promise<TelegramDispatchSummary> {
  const summary: TelegramDispatchSummary = { sent: 0, retryable: 0, dead: 0, lostLease: 0 };
  const limit = Math.max(0, Math.min(MAX_INLINE_DELIVERIES, Math.floor(maxDeliveries)));

  for (let index = 0; index < limit; index += 1) {
    const claimedAt = now();
    const row = await claimTelegramDelivery({ botId, updateId, now: claimedAt });
    if (!row) break;
    const result = await dispatchClaimedTelegramDelivery({ row, now, token, fetchImpl });
    summary.sent += result.sent;
    summary.retryable += result.retryable;
    summary.dead += result.dead;
    summary.lostLease += result.lostLease;
  }

  return summary;
}
