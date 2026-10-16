import {
  claimTelegramDelivery,
  markTelegramDeliveryDead,
  markTelegramDeliveryRetryable,
  markTelegramDeliverySent,
  type TelegramDeliveryRow,
} from "@/lib/telegram/outbox";
import { db } from "@/lib/db/client";
import { categories, group_members, recurringExecutions, recurringExpenses, reimbursementRequests, split_payments, split_session_members, telegram_operations, transactions, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { hasProactiveConsent } from "@/lib/notifications/proactive-consent";
import { DAILY_SUMMARY_OPERATION_KIND, parseDailySummaryContext } from "@/lib/notifications/daily-summary-delivery";
import { resolveAuthorizedTelegramGroup } from "@/lib/telegram/authorized-group-context";
import { isDailySummaryRecipientAllowed } from "@/lib/notifications/daily-summary-canary";
import { RECURRING_REMINDER_OPERATION_KIND, buildRecurringReminderSnapshotHash, parseRecurringReminderContext, recurringReminderMessageHash } from "@/lib/notifications/recurring-reminder-delivery";
import { isRecurringReminderRecipientAllowed } from "@/lib/notifications/recurring-reminder-canary";
import { isReimbursementReminderRecipientAllowed } from "@/lib/notifications/reimbursement-reminder-canary";
import { REIMBURSEMENT_REMINDER_OPERATION_KIND, buildReimbursementReminderSnapshotHash, parseReimbursementReminderContext, reimbursementReminderMessageHash } from "@/lib/notifications/reimbursement-reminder-delivery";
import { getArgentinaDateKey } from "@/lib/utils/dates";

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

async function webSplitPaymentRejection(row: TelegramDeliveryRow): Promise<string | null> {
  const [operation] = await db.select({
    botId: telegram_operations.bot_id,
    updateId: telegram_operations.update_id,
    kind: telegram_operations.operation_kind,
    status: telegram_operations.status,
    resourceType: telegram_operations.resource_type,
    paymentId: telegram_operations.resource_id,
  }).from(telegram_operations).where(eq(telegram_operations.operation_id, row.operation_id)).limit(1);
  if (!operation || operation.botId !== row.bot_id || operation.updateId !== row.update_id ||
    operation.kind !== "web.split.payment" || operation.status !== "committed" ||
    operation.resourceType !== "split_payment" || !operation.paymentId || row.action !== "send_message") {
    return "invalid_payment_context";
  }
  const [payment] = await db.select({
    sessionId: split_payments.session_id,
    payeeUserId: split_payments.payee_user_id,
    confirmedAt: split_payments.confirmed_at,
  }).from(split_payments).where(eq(split_payments.id, operation.paymentId)).limit(1);
  if (!payment?.payeeUserId || payment.confirmedAt === null) return "invalid_payment_context";
  const [member] = await db.select({ userId: split_session_members.user_id })
    .from(split_session_members)
    .where(and(eq(split_session_members.session_id, payment.sessionId),
      eq(split_session_members.user_id, payment.payeeUserId))).limit(1);
  if (!member) return "member_removed";
  const [payee] = await db.select({ chatId: users.telegram_user_id })
    .from(users).where(eq(users.id, payment.payeeUserId)).limit(1);
  if (!payee?.chatId || payee.chatId !== row.chat_id) return "recipient_changed";
  return null;
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

async function recurringReminderRejection(row: TelegramDeliveryRow, claimedAt: number): Promise<string | null> {
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
    operation.kind !== RECURRING_REMINDER_OPERATION_KIND || operation.status !== "committed" ||
    operation.resourceType !== "recurring_reminder" || !operation.userId) return "invalid_proactive_context";
  const context = parseRecurringReminderContext(operation.context);
  if (!context || row.action !== "send_message" ||
    recurringReminderMessageHash(row.text) !== context.messageHash) return "invalid_proactive_context";
  if (!isRecurringReminderRecipientAllowed(operation.userId, context.groupId)) return "notifications_disabled";
  if (getArgentinaDateKey(new Date(claimedAt)) !== context.argentinaDate) return "reminder_expired";
  if (!await hasProactiveConsent(operation.userId, "recurring")) return "consent_revoked";
  const [user] = await db.select({
    telegramId: users.telegram_user_id,
    activeGroupId: users.active_telegram_group_id,
  }).from(users).where(eq(users.id, operation.userId)).limit(1);
  if (!user || user.telegramId !== row.chat_id) return "recipient_changed";
  if (user.activeGroupId !== context.groupId) return "group_changed";

  const executions = await db.select({
    id: recurringExecutions.id,
    status: recurringExecutions.status,
    scheduledDate: recurringExecutions.scheduledDate,
    amountArs: recurringExecutions.amountArs,
    userId: recurringExpenses.userId,
    groupId: recurringExpenses.groupId,
    recurringName: recurringExpenses.name,
    recurringAmount: recurringExpenses.amountArs,
    categoryEmoji: categories.emoji,
  }).from(recurringExecutions)
    .innerJoin(recurringExpenses, eq(recurringExecutions.recurringExpenseId, recurringExpenses.id))
    .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
    .innerJoin(group_members, and(
      eq(group_members.user_id, recurringExpenses.userId),
      eq(group_members.group_id, recurringExpenses.groupId),
    ))
    .where(inArray(recurringExecutions.id, context.executionIds));
  if (executions.length !== context.executionIds.length ||
    executions.some((execution) => execution.status !== "pending" ||
      execution.userId !== operation.userId || execution.groupId !== context.groupId ||
      (context.reminderKind === "upcoming"
        ? execution.scheduledDate !== getUpcomingReminderDate(context.argentinaDate)
        : execution.scheduledDate >= context.argentinaDate))) return "reminder_changed";
  if (buildRecurringReminderSnapshotHash(executions.map((execution) => ({
    id: execution.id,
    scheduledDate: execution.scheduledDate,
    amountArs: execution.amountArs,
    recurringName: execution.recurringName,
    recurringAmount: execution.recurringAmount,
    categoryEmoji: execution.categoryEmoji,
  }))) !== context.snapshotHash) return "reminder_changed";
  return null;
}

async function reimbursementReminderRejection(row: TelegramDeliveryRow, claimedAt: number): Promise<string | null> {
  const [operation] = await db.select({
    botId: telegram_operations.bot_id,
    updateId: telegram_operations.update_id,
    kind: telegram_operations.operation_kind,
    status: telegram_operations.status,
    resourceType: telegram_operations.resource_type,
    payerId: telegram_operations.resource_id,
    context: telegram_operations.result_json,
  }).from(telegram_operations).where(eq(telegram_operations.operation_id, row.operation_id)).limit(1);
  if (!operation || operation.botId !== row.bot_id || operation.updateId !== row.update_id ||
    operation.kind !== REIMBURSEMENT_REMINDER_OPERATION_KIND || operation.status !== "committed" ||
    operation.resourceType !== "reimbursement_reminder" || !operation.payerId) return "invalid_proactive_context";
  const context = parseReimbursementReminderContext(operation.context);
  if (!context || row.action !== "send_message" ||
    reimbursementReminderMessageHash(row.text) !== context.messageHash) return "invalid_proactive_context";
  if (!isReimbursementReminderRecipientAllowed(operation.payerId, context.groupId)) return "notifications_disabled";
  if (getArgentinaDateKey(new Date(claimedAt)) !== context.argentinaDate) return "reminder_expired";
  if (!await hasProactiveConsent(operation.payerId, "reimbursements")) return "consent_revoked";
  const [payer] = await db.select({ telegramId: users.telegram_user_id })
    .from(users).where(eq(users.id, operation.payerId)).limit(1);
  if (!payer || payer.telegramId !== row.chat_id) return "recipient_changed";
  const [request] = await db.select({
    transactionId: reimbursementRequests.transactionId,
    requesterId: reimbursementRequests.requesterId,
    payerId: reimbursementRequests.payerId,
    amount: reimbursementRequests.amount,
    status: reimbursementRequests.status,
    createdAt: reimbursementRequests.createdAt,
  }).from(reimbursementRequests).where(eq(reimbursementRequests.id, context.requestId)).limit(1);
  if (!request || request.status !== "pending" || request.payerId !== operation.payerId ||
    request.createdAt > claimedAt - 3 * 24 * 60 * 60 * 1000) return "reminder_changed";
  const [source] = await db.select({
    groupId: transactions.group_id,
    status: transactions.status,
    deletedAt: transactions.deleted_at,
  }).from(transactions).where(eq(transactions.id, request.transactionId)).limit(1);
  if (!source || source.groupId !== context.groupId || source.status !== "active" ||
    source.deletedAt !== null) return "reminder_changed";
  const memberships = await db.select({ userId: group_members.user_id }).from(group_members)
    .where(and(eq(group_members.group_id, context.groupId),
      inArray(group_members.user_id, [operation.payerId, request.requesterId])));
  if (new Set(memberships.map((member) => member.userId)).size !== 2) return "membership_revoked";
  const [requester] = await db.select({ name: users.name })
    .from(users).where(eq(users.id, request.requesterId)).limit(1);
  const snapshotHash = buildReimbursementReminderSnapshotHash({
    requestId: context.requestId,
    transactionId: request.transactionId,
    payerId: operation.payerId,
    requesterId: request.requesterId,
    groupId: context.groupId,
    amount: request.amount,
    createdAt: request.createdAt,
    requesterName: requester?.name ?? "Alguien",
  });
  return snapshotHash === context.snapshotHash ? null : "reminder_changed";
}

function getUpcomingReminderDate(argentinaDate: string): string {
  const date = new Date(`${argentinaDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString().slice(0, 10);
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
  const isRecurringReminder = row.update_id.startsWith("cron:recurring:");
  const isReimbursementReminder = row.update_id.startsWith("cron:reimbursement:");
  const isWebSplitPayment = row.update_id.startsWith("web-split:");
  const isAtMostOnceDelivery = isDailySummary || isRecurringReminder || isReimbursementReminder || isWebSplitPayment;
  if (isAtMostOnceDelivery) {
    // A recovered lease may follow a provider-accepted request whose response
    // never reached us. Do not call sendMessage twice for this beta alert.
    const rejection = row.attempt_count > 1
      ? "delivery_uncertain"
      : isDailySummary
        ? await dailySummaryRejection(row)
        : isRecurringReminder
          ? await recurringReminderRejection(row, claimedAt)
        : isReimbursementReminder
          ? await reimbursementReminderRejection(row, claimedAt)
          : await webSplitPaymentRejection(row);
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
    if (isAtMostOnceDelivery) {
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

  if (isAtMostOnceDelivery) {
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
