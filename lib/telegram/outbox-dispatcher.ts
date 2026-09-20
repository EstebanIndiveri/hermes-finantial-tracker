import {
  claimTelegramDelivery,
  markTelegramDeliveryDead,
  markTelegramDeliveryRetryable,
  markTelegramDeliverySent,
  type TelegramDeliveryRow,
} from "@/lib/telegram/outbox";

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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

export async function dispatchTelegramDeliveriesForUpdate({
  botId,
  updateId,
  now = Date.now,
  maxDeliveries = MAX_INLINE_DELIVERIES,
  token = process.env.TELEGRAM_BOT_TOKEN,
  fetchImpl = fetch,
}: DispatchTelegramUpdateInput): Promise<TelegramDispatchSummary> {
  const summary: TelegramDispatchSummary = { sent: 0, retryable: 0, dead: 0 };
  const limit = Math.max(0, Math.min(MAX_INLINE_DELIVERIES, Math.floor(maxDeliveries)));

  for (let index = 0; index < limit; index += 1) {
    const claimedAt = now();
    const row = await claimTelegramDelivery({ botId, updateId, now: claimedAt });
    if (!row) break;
    const leaseToken = row.lease_token;
    if (!leaseToken) throw new Error("Claimed Telegram delivery has no lease token");

    if (!token) {
      await markTelegramDeliveryRetryable({
        id: row.id,
        leaseToken,
        errorCode: "missing_token",
        retryAt: claimedAt + retryDelayMs(row.attempt_count),
        now: claimedAt,
      });
      summary.retryable += 1;
      continue;
    }

    const result = await deliver(row, token, fetchImpl);
    if (result.kind === "sent") {
      await markTelegramDeliverySent({
        id: row.id,
        leaseToken,
        providerMessageId: result.providerMessageId,
        now: now(),
      });
      summary.sent += 1;
      continue;
    }

    if (result.kind === "retryable" && row.attempt_count < MAX_ATTEMPTS) {
      const finishedAt = now();
      await markTelegramDeliveryRetryable({
        id: row.id,
        leaseToken,
        errorCode: result.errorCode,
        httpStatus: result.httpStatus,
        retryAt: finishedAt + (result.retryAfterMs ?? retryDelayMs(row.attempt_count)),
        now: finishedAt,
      });
      summary.retryable += 1;
      continue;
    }

    await markTelegramDeliveryDead({
      id: row.id,
      leaseToken,
      errorCode: result.kind === "retryable" ? "attempts_exhausted" : result.errorCode,
      httpStatus: result.httpStatus,
      now: now(),
    });
    summary.dead += 1;
  }

  return summary;
}
