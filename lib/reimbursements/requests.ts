import { db } from "@/lib/db/client";
import {
  categories,
  groups,
  group_members,
  reimbursementRequests,
  telegram_delivery_outbox,
  transactions,
  userPaymentInfo,
  users,
} from "@/lib/db/schema";
import {
  buildReimbursementCancelledNotification,
  buildReimbursementPaidNotification,
  buildReimbursementRequestNotification,
  getUserById,
  notifyGroupOfReimbursementRequest,
  notifyReimbursementPaid,
} from "@/lib/notifications/telegram";
import { sendPushToUser } from "@/lib/notifications/web-push";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createTelegramDeliveryKey,
  createTelegramOperationContext,
  createTelegramOperationIdentity,
  type TelegramOperationContext,
} from "@/lib/telegram/operation-context";
import { runTelegramOperation, type TelegramOperationTransaction } from "@/lib/telegram/financial-operation";
import { buildTelegramDeliveryRow } from "@/lib/telegram/outbox";

export type ReimbursementStatus = "pending" | "paid" | "cancelled";

export interface ReimbursementRequest {
  id: string;
  transactionId: string;
  requesterId: string;
  payerId: string | null;
  amount: number;
  status: ReimbursementStatus;
  paidAt: string | null;
  createdAt: number;
  requester?: { id: string; name: string };
  transaction?: { description: string | null; categoryId: string };
}

type ReimbursementRequestRow = {
  id: string;
  transactionId: string;
  requesterId: string;
  payerId: string | null;
  amount: number;
  status: string;
  paidAt: string | null;
  createdAt: number;
};

/**
 * Maps a reimbursement request row to the public reimbursement shape.
 *
 * @param row - Database row for a reimbursement request.
 * @returns The mapped reimbursement request.
 */
function mapReimbursementRequestRow(row: ReimbursementRequestRow): ReimbursementRequest {
  return {
    id: row.id,
    transactionId: row.transactionId,
    requesterId: row.requesterId,
    payerId: row.payerId,
    amount: row.amount,
    status: row.status as ReimbursementStatus,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
  };
}

function reimbursementContext(
  context: TelegramOperationContext,
  action: "create" | "pay" | "cancel",
  suffix: string,
): TelegramOperationContext {
  return createTelegramOperationContext({
    botId: context.botId,
    updateId: context.updateId,
    chatId: context.chatId,
    callbackMessageId: context.callbackMessageId,
    action: `reimbursement.${action}`,
    suffix,
  });
}

export interface ReimbursementOperationDelivery {
  deliveryOperationId: string;
  deliveryKey: string;
}

export interface ReimbursementMutationOperationResult extends Partial<ReimbursementOperationDelivery> {
  ok: boolean;
}

export type ReimbursementCreationOperationResult =
  | (ReimbursementRequest & Partial<ReimbursementOperationDelivery>)
  | ({ error: string } & Partial<ReimbursementOperationDelivery>);

export interface ReimbursementOperationOptions {
  /** Disable when a parent financial operation owns the callback response. */
  enqueuePrimaryResponse?: boolean;
}

async function enqueueReimbursementPrimaryResponse(
  transaction: TelegramOperationTransaction,
  context: TelegramOperationContext,
  operationId: string,
  text: string,
): Promise<string> {
  const deliveryKey = createTelegramDeliveryKey({ operationId }, "primary", context.chatId);
  await transaction
    .insert(telegram_delivery_outbox)
    .values(buildTelegramDeliveryRow({
      botId: context.botId,
      updateId: context.updateId,
      operationId,
      deliveryKey,
      action: context.callbackMessageId == null ? "send_message" : "edit_message",
      chatId: context.chatId,
      messageId: context.callbackMessageId,
      text,
      parseMode: "HTML",
    }))
    .onConflictDoNothing({
      target: [telegram_delivery_outbox.bot_id, telegram_delivery_outbox.delivery_key],
    });
  return deliveryKey;
}

async function enqueueReimbursementTelegram(
  transaction: TelegramOperationTransaction,
  context: TelegramOperationContext,
  operationId: string,
  recipients: Array<{ telegramId: string; message: { text: string; replyMarkup?: Record<string, unknown> } }>,
  action: string,
): Promise<void> {
  for (const recipient of recipients) {
    const deliveryKey = createTelegramDeliveryKey(
      { operationId },
      action,
      recipient.telegramId,
    );
    await transaction
      .insert(telegram_delivery_outbox)
      .values(buildTelegramDeliveryRow({
        botId: context.botId,
        updateId: context.updateId,
        operationId,
        deliveryKey,
        action: "send_message",
        chatId: recipient.telegramId,
        text: recipient.message.text,
        replyMarkup: recipient.message.replyMarkup,
        parseMode: "HTML",
      }))
      .onConflictDoNothing({
        target: [telegram_delivery_outbox.bot_id, telegram_delivery_outbox.delivery_key],
      });
  }
}

/**
 * Creates a pending reimbursement request.
 *
 * @param transactionId - Related transaction identifier.
 * @param requesterId - User identifier requesting reimbursement.
 * @param amount - Requested reimbursement amount.
 * @param payerId - Optional user identifier responsible for payment.
 * @returns The created reimbursement request.
 */
export async function createReimbursementRequest(
  transactionId: string,
  requesterId: string,
  amount: number,
  payerId?: string,
): Promise<ReimbursementRequest> {
  const id = nanoid();

  const [request] = await db
    .insert(reimbursementRequests)
    .values({
      id,
      transactionId,
      requesterId,
      payerId: payerId ?? null,
      amount,
      status: "pending",
    })
    .returning();

  return mapReimbursementRequestRow(request);
}

/**
 * Creates a pending reimbursement request and dispatches notifications.
 *
 * @param transactionId - Related transaction identifier.
 * @param requesterId - User identifier requesting reimbursement.
 * @param amount - Requested reimbursement amount.
 * @param payerId - Optional user identifier responsible for payment.
 * @returns The created reimbursement request.
 */
export function createReimbursementWithNotifications(
  transactionId: string,
  requesterId: string,
  amount: number,
  payerId: string | undefined,
  operationContext: TelegramOperationContext,
  options?: ReimbursementOperationOptions,
): Promise<ReimbursementCreationOperationResult>;
export function createReimbursementWithNotifications(
  transactionId: string,
  requesterId: string,
  amount: number,
  payerId: string | undefined,
  operationContext: TelegramOperationContext | undefined,
  options?: ReimbursementOperationOptions,
): Promise<ReimbursementCreationOperationResult | ReimbursementRequest | { error: string }>;
export function createReimbursementWithNotifications(
  transactionId: string,
  requesterId: string,
  amount: number,
  payerId?: string,
): Promise<ReimbursementRequest | { error: string }>;
export async function createReimbursementWithNotifications(
  transactionId: string,
  requesterId: string,
  amount: number,
  payerId?: string,
  operationContext?: TelegramOperationContext,
  options?: ReimbursementOperationOptions,
): Promise<ReimbursementCreationOperationResult | ReimbursementRequest | { error: string }> {
  if (operationContext) {
    const context = reimbursementContext(operationContext, "create", transactionId);
    const identity = createTelegramOperationIdentity(context);
    const operation = await runTelegramOperation<
      | { request: ReimbursementRequest; pushUserId?: string; deliveryKey?: string }
      | { error: string }
    >(
      <T>(work: (transaction: TelegramOperationTransaction) => Promise<T>) => db.transaction(work),
      {
        identity,
        botId: context.botId,
        updateId: context.updateId,
        operationKind: "reimbursement.create",
      },
      async (transaction) => {
        const [transactionRow] = await transaction
          .select({
            description: transactions.description,
            groupId: transactions.group_id,
            categoryId: transactions.category_id,
            userId: transactions.user_id,
          })
          .from(transactions)
          .where(eq(transactions.id, transactionId));

        if (!transactionRow || transactionRow.userId !== requesterId) {
          return {
            resourceType: null,
            resourceId: null,
            result: { error: "El gasto no pertenece al solicitante." },
          };
        }
        if (transactionRow.groupId) {
          const [membership] = await transaction
            .select({ userId: group_members.user_id })
            .from(group_members)
            .where(and(
              eq(group_members.group_id, transactionRow.groupId),
              eq(group_members.user_id, requesterId),
            ));
          if (!membership) {
            return {
              resourceType: null,
              resourceId: null,
              result: { error: "Ya no tenés acceso al grupo del gasto." },
            };
          }
        }

        let effectivePayerId = payerId;
        if (!effectivePayerId && transactionRow?.groupId) {
          const [group] = await transaction
            .select({ partnerId: groups.partner_id })
            .from(groups)
            .where(eq(groups.id, transactionRow.groupId));
          if (group?.partnerId && group.partnerId !== requesterId) {
            effectivePayerId = group.partnerId;
          }
        }

        if (effectivePayerId === requesterId) {
          return {
            resourceType: null,
            resourceId: null,
            result: { error: "No podés solicitar un reintegro a vos mismo." },
          };
        }

        const id = nanoid();
        const [request] = await transaction
          .insert(reimbursementRequests)
          .values({
            id,
            operationId: identity.operationId,
            transactionId,
            requesterId,
            payerId: effectivePayerId ?? null,
            amount,
            status: "pending",
          })
          .returning();
        const mappedRequest = mapReimbursementRequestRow(request);

        const deliveryKey = options?.enqueuePrimaryResponse === false
          ? undefined
          : await enqueueReimbursementPrimaryResponse(
              transaction,
              context,
              identity.operationId,
              "✅ Reintegro solicitado.",
            );

        if (!transactionRow?.groupId) {
          return {
            resourceType: "reimbursement",
            resourceId: id,
            result: { request: mappedRequest, deliveryKey },
          };
        }

        const [category] = await transaction
          .select({ name: categories.name })
          .from(categories)
          .where(eq(categories.id, transactionRow.categoryId));
        const [requester] = await transaction
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, requesterId));
        const [paymentInfo] = await transaction
          .select({ paymentMethod: userPaymentInfo.paymentMethod, value: userPaymentInfo.value })
          .from(userPaymentInfo)
          .where(and(eq(userPaymentInfo.userId, requesterId), eq(userPaymentInfo.isDefault, true)));
        const members = await transaction
          .select({ userId: group_members.user_id, telegramId: users.telegram_user_id })
          .from(group_members)
          .innerJoin(users, eq(group_members.user_id, users.id))
          .where(eq(group_members.group_id, transactionRow.groupId));
        const message = buildReimbursementRequestNotification({
          requesterName: requester?.name,
          amount,
          categoryName: category?.name ?? "Sin categoría",
          description: transactionRow.description ?? "",
          reimbursementId: id,
          paymentMethod: paymentInfo?.paymentMethod,
          paymentValue: paymentInfo?.value,
        });
        await enqueueReimbursementTelegram(
          transaction,
          context,
          identity.operationId,
          members
            .filter((member) => member.userId !== requesterId && member.telegramId)
            .map((member) => ({ telegramId: member.telegramId as string, message })),
          "reimbursement.request",
        );

        return {
          resourceType: "reimbursement",
          resourceId: id,
          result: { request: mappedRequest, pushUserId: effectivePayerId, deliveryKey },
        };
      },
    );
    if (operation.kind === "busy") return { error: "⏳ Procesando solicitud de reintegro..." };
    if (
      !operation.reused &&
      !(("error" in operation.result)) &&
      operation.result.pushUserId
    ) {
      await sendPushToUser(operation.result.pushUserId, {
        title: "💸 Solicitud de Reintegro",
        body: `Te han solicitado $${amount.toLocaleString("es-AR")}`,
        url: "/dashboard/reimbursements",
      });
    }
    if ("error" in operation.result) return operation.result;
    return operation.result.deliveryKey
      ? {
          ...operation.result.request,
          deliveryOperationId: operation.operationId,
          deliveryKey: operation.result.deliveryKey,
        }
      : operation.result.request;
  }

  // First, get the transaction to find the groupId
  const [transaction] = await db
    .select({
      description: transactions.description,
      groupId: transactions.group_id,
      categoryId: transactions.category_id,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId));

  // If no payerId provided, try to use the group's partner
  let effectivePayerId = payerId;
  if (!effectivePayerId && transaction?.groupId) {
    const [group] = await db
      .select({ partnerId: groups.partner_id })
      .from(groups)
      .where(eq(groups.id, transaction.groupId));
    
    // Only use partner if it's not the same as the requester
    if (group?.partnerId && group.partnerId !== requesterId) {
      effectivePayerId = group.partnerId;
    }
  }

  // Block self-reimbursement: requester cannot pay their own reimbursement
  if (effectivePayerId === requesterId) {
    return { error: "No podés solicitar un reintegro a vos mismo." };
  }

  const request = await createReimbursementRequest(transactionId, requesterId, amount, effectivePayerId);

  if (!transaction?.groupId) {
    return request;
  }

  const [category] = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, transaction.categoryId));

  await notifyGroupOfReimbursementRequest(
    transaction.groupId,
    requesterId,
    request.id,
    amount,
    category?.name ?? "Sin categoría",
    transaction.description ?? "",
  );

  if (effectivePayerId) {
    await sendPushToUser(effectivePayerId, {
      title: "💸 Solicitud de Reintegro",
      body: `Te han solicitado $${amount.toLocaleString("es-AR")}`,
      url: "/dashboard/reimbursements",
    });
  }

  return request;
}

/**
 * Retrieves reimbursements where the user is requester or payer.
 *
 * @param userId - User identifier to search reimbursements for.
 * @returns Reimbursements ordered from newest to oldest.
 */
export async function getReimbursementsByUser(userId: string): Promise<ReimbursementRequest[]> {
  const rows = await db
    .select({
      id: reimbursementRequests.id,
      transactionId: reimbursementRequests.transactionId,
      requesterId: reimbursementRequests.requesterId,
      payerId: reimbursementRequests.payerId,
      amount: reimbursementRequests.amount,
      status: reimbursementRequests.status,
      paidAt: reimbursementRequests.paidAt,
      createdAt: reimbursementRequests.createdAt,
    })
    .from(reimbursementRequests)
    .where(or(eq(reimbursementRequests.requesterId, userId), eq(reimbursementRequests.payerId, userId)))
    .orderBy(desc(reimbursementRequests.createdAt));

  return rows.map(mapReimbursementRequestRow);
}

/**
 * Retrieves pending reimbursements assigned to a payer.
 *
 * @param payerId - User identifier for the payer.
 * @returns Pending reimbursement requests ordered from newest to oldest.
 */
export async function getPendingReimbursementsForPayer(payerId: string): Promise<ReimbursementRequest[]> {
  const rows = await db
    .select()
    .from(reimbursementRequests)
    .where(and(eq(reimbursementRequests.payerId, payerId), eq(reimbursementRequests.status, "pending")))
    .orderBy(desc(reimbursementRequests.createdAt));

  return rows.map(mapReimbursementRequestRow);
}

/**
 * Retrieves pending "open" reimbursements for a group (no payer assigned).
 * Excludes reimbursements requested by the given user.
 *
 * @param groupId - Group identifier.
 * @param excludeUserId - User to exclude (the one viewing, shouldn't see their own requests here).
 * @returns Open pending reimbursement requests.
 */
export async function getOpenGroupReimbursements(
  groupId: string,
  excludeUserId: string,
): Promise<ReimbursementRequest[]> {
  const rows = await db
    .select({
      id: reimbursementRequests.id,
      transactionId: reimbursementRequests.transactionId,
      requesterId: reimbursementRequests.requesterId,
      payerId: reimbursementRequests.payerId,
      amount: reimbursementRequests.amount,
      status: reimbursementRequests.status,
      paidAt: reimbursementRequests.paidAt,
      createdAt: reimbursementRequests.createdAt,
    })
    .from(reimbursementRequests)
    .innerJoin(transactions, eq(reimbursementRequests.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.group_id, groupId),
        eq(reimbursementRequests.status, "pending"),
        isNull(reimbursementRequests.payerId),
        ne(reimbursementRequests.requesterId, excludeUserId),
      ),
    )
    .orderBy(desc(reimbursementRequests.createdAt));

  return rows.map(mapReimbursementRequestRow);
}

/**
 * Marks a reimbursement as paid. Works for both assigned payers and open reimbursements.
 * For open reimbursements, assigns the payer at payment time.
 *
 * @param id - Reimbursement request identifier.
 * @param payerId - User identifier of the payer.
 * @returns Whether a reimbursement request was updated.
 */
export async function markReimbursementAsPaid(id: string, payerId: string): Promise<boolean> {
  // First, try to update if payerId matches (assigned reimbursement)
  let updatedRows = await db
    .update(reimbursementRequests)
    .set({
      status: "paid",
      paidAt: new Date().toISOString(),
    })
    .returning({ id: reimbursementRequests.id })
    .where(
      and(
        eq(reimbursementRequests.id, id),
        eq(reimbursementRequests.payerId, payerId),
        eq(reimbursementRequests.status, "pending"),
      ),
    );

  if (updatedRows.length > 0) return true;

  // If no match, try open reimbursement (payerId is NULL) and assign the payer
  updatedRows = await db
    .update(reimbursementRequests)
    .set({
      status: "paid",
      payerId,
      paidAt: new Date().toISOString(),
    })
    .returning({ id: reimbursementRequests.id })
    .where(
      and(
        eq(reimbursementRequests.id, id),
        isNull(reimbursementRequests.payerId),
        eq(reimbursementRequests.status, "pending"),
      ),
    );

  return updatedRows.length > 0;
}

/**
 * Marks a reimbursement as paid and dispatches notifications to the requester.
 *
 * @param id - Reimbursement request identifier.
 * @param payerId - User identifier of the payer.
 * @returns Whether a reimbursement request was updated.
 */
export function markReimbursementAsPaidWithNotifications(
  id: string,
  payerId: string,
  operationContext: TelegramOperationContext,
): Promise<ReimbursementMutationOperationResult>;
export function markReimbursementAsPaidWithNotifications(
  id: string,
  payerId: string,
): Promise<boolean>;
export async function markReimbursementAsPaidWithNotifications(
  id: string,
  payerId: string,
  operationContext?: TelegramOperationContext,
): Promise<boolean | ReimbursementMutationOperationResult> {
  if (operationContext) {
    const context = reimbursementContext(operationContext, "pay", id);
    const identity = createTelegramOperationIdentity(context);
    const operation = await runTelegramOperation<{
      ok: boolean;
      pushUserId?: string;
      pushTitle?: string;
      pushBody?: string;
      deliveryKey?: string;
    }>(
      <T>(work: (transaction: TelegramOperationTransaction) => Promise<T>) => db.transaction(work),
      {
        identity,
        botId: context.botId,
        updateId: context.updateId,
        operationKind: "reimbursement.pay",
      },
      async (transaction) => {
        const [reimbursement] = await transaction
          .select()
          .from(reimbursementRequests)
          .where(eq(reimbursementRequests.id, id));
        if (!reimbursement || reimbursement.status !== "pending") {
          return { resourceType: null, resourceId: null, result: { ok: false } };
        }

        const [sourceTransaction] = await transaction
          .select({ groupId: transactions.group_id })
          .from(transactions)
          .where(eq(transactions.id, reimbursement.transactionId));
        if (sourceTransaction?.groupId) {
          const [membership] = await transaction
            .select({ userId: group_members.user_id })
            .from(group_members)
            .where(and(
              eq(group_members.group_id, sourceTransaction.groupId),
              eq(group_members.user_id, payerId),
            ));
          if (!membership) {
            return { resourceType: null, resourceId: null, result: { ok: false } };
          }
        }

        const paidAt = new Date().toISOString();
        let updatedRows = await transaction
          .update(reimbursementRequests)
          .set({ status: "paid", paidAt })
          .returning({ id: reimbursementRequests.id })
          .where(and(
            eq(reimbursementRequests.id, id),
            eq(reimbursementRequests.payerId, payerId),
            eq(reimbursementRequests.status, "pending"),
          ));
        if (updatedRows.length === 0) {
          updatedRows = await transaction
            .update(reimbursementRequests)
            .set({ status: "paid", payerId, paidAt })
            .returning({ id: reimbursementRequests.id })
            .where(and(
              eq(reimbursementRequests.id, id),
              isNull(reimbursementRequests.payerId),
              eq(reimbursementRequests.status, "pending"),
            ));
        }
        if (updatedRows.length === 0) {
          return { resourceType: null, resourceId: null, result: { ok: false } };
        }

        const [payer] = await transaction
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, payerId));
        const [requester] = await transaction
          .select({ telegramId: users.telegram_user_id })
          .from(users)
          .where(eq(users.id, reimbursement.requesterId));
        const payerName = payer?.name ?? "Alguien";
        const message = buildReimbursementPaidNotification(payerName, reimbursement.amount);
        if (requester?.telegramId) {
          await enqueueReimbursementTelegram(
            transaction,
            context,
            identity.operationId,
            [{ telegramId: requester.telegramId, message }],
            "reimbursement.paid",
          );
        }
        const deliveryKey = await enqueueReimbursementPrimaryResponse(
          transaction,
          context,
          identity.operationId,
          "✅ Reintegro marcado como pagado.",
        );
        return {
          resourceType: "reimbursement",
          resourceId: id,
          result: {
            ok: true,
            pushUserId: reimbursement.requesterId,
            pushTitle: "✅ Reintegro Pagado",
            pushBody: `${payerName} te pagó $${reimbursement.amount.toLocaleString("es-AR")}`,
            deliveryKey,
          },
        };
      },
    );
    if (operation.kind === "busy" || !operation.result.ok || !operation.result.deliveryKey) {
      return { ok: false };
    }
    if (
      !operation.reused &&
      operation.result.pushUserId &&
      operation.result.pushTitle &&
      operation.result.pushBody
    ) {
      await sendPushToUser(operation.result.pushUserId, {
        title: operation.result.pushTitle,
        body: operation.result.pushBody,
        url: "/dashboard/reimbursements",
      });
    }
    return {
      ok: true,
      deliveryOperationId: operation.operationId,
      deliveryKey: operation.result.deliveryKey,
    };
  }

  const reimbursement = await getReimbursementById(id);

  if (!reimbursement || reimbursement.status !== "pending") {
    return false;
  }

  const paid = await markReimbursementAsPaid(id, payerId);

  if (!paid) {
    return false;
  }

  const payer = await getUserById(payerId);
  const payerName = payer?.name ?? "Alguien";

  await notifyReimbursementPaid(reimbursement.requesterId, payerName, reimbursement.amount);
  await sendPushToUser(reimbursement.requesterId, {
    title: "✅ Reintegro Pagado",
    body: `${payerName} te pagó $${reimbursement.amount.toLocaleString("es-AR")}`,
    url: "/dashboard/reimbursements",
  });

  return true;
}

/**
 * Cancels a reimbursement when it belongs to the given requester.
 *
 * @param id - Reimbursement request identifier.
 * @param requesterId - User identifier of the requester.
 * @returns Whether a reimbursement request was updated.
 */
export async function cancelReimbursement(id: string, requesterId: string): Promise<boolean> {
  const updatedRows = await db
    .update(reimbursementRequests)
    .set({ status: "cancelled" })
    .returning({ id: reimbursementRequests.id })
    .where(
      and(
        eq(reimbursementRequests.id, id),
        eq(reimbursementRequests.requesterId, requesterId),
        eq(reimbursementRequests.status, "pending"),
      ),
    );

  return updatedRows.length > 0;
}

/**
 * Cancels a reimbursement and notifies the payer/group.
 *
 * @param id - Reimbursement request identifier.
 * @param requesterId - User identifier of the requester.
 * @returns Whether a reimbursement request was cancelled.
 */
export function cancelReimbursementWithNotifications(
  id: string,
  requesterId: string,
  operationContext: TelegramOperationContext,
): Promise<ReimbursementMutationOperationResult>;
export function cancelReimbursementWithNotifications(
  id: string,
  requesterId: string,
): Promise<boolean>;
export async function cancelReimbursementWithNotifications(
  id: string,
  requesterId: string,
  operationContext?: TelegramOperationContext,
): Promise<boolean | ReimbursementMutationOperationResult> {
  if (operationContext) {
    const context = reimbursementContext(operationContext, "cancel", id);
    const identity = createTelegramOperationIdentity(context);
    const operation = await runTelegramOperation<{ ok: boolean; deliveryKey?: string }>(
      <T>(work: (transaction: TelegramOperationTransaction) => Promise<T>) => db.transaction(work),
      {
        identity,
        botId: context.botId,
        updateId: context.updateId,
        operationKind: "reimbursement.cancel",
      },
      async (transaction) => {
        const [reimbursement] = await transaction
          .select()
          .from(reimbursementRequests)
          .where(eq(reimbursementRequests.id, id));
        if (!reimbursement || reimbursement.status !== "pending" || reimbursement.requesterId !== requesterId) {
          return { resourceType: null, resourceId: null, result: { ok: false } };
        }


        const [transactionRow] = await transaction
          .select({ groupId: transactions.group_id })
          .from(transactions)
          .where(eq(transactions.id, reimbursement.transactionId));
        if (transactionRow?.groupId) {
          const [membership] = await transaction
            .select({ userId: group_members.user_id })
            .from(group_members)
            .where(and(
              eq(group_members.group_id, transactionRow.groupId),
              eq(group_members.user_id, requesterId),
            ));
          if (!membership) {
            return { resourceType: null, resourceId: null, result: { ok: false } };
          }
        }

        const updatedRows = await transaction
          .update(reimbursementRequests)
          .set({ status: "cancelled" })
          .returning({ id: reimbursementRequests.id })
          .where(and(
            eq(reimbursementRequests.id, id),
            eq(reimbursementRequests.requesterId, requesterId),
            eq(reimbursementRequests.status, "pending"),
          ));
        if (updatedRows.length === 0) {
          return { resourceType: null, resourceId: null, result: { ok: false } };
        }

        const [requester] = await transaction
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, requesterId));
        if (transactionRow?.groupId) {
          const members = await transaction
            .select({ userId: group_members.user_id, telegramId: users.telegram_user_id })
            .from(group_members)
            .innerJoin(users, eq(group_members.user_id, users.id))
            .where(eq(group_members.group_id, transactionRow.groupId));
          const message = buildReimbursementCancelledNotification(
            requester?.name ?? "Alguien",
            reimbursement.amount,
          );
          await enqueueReimbursementTelegram(
            transaction,
            context,
            identity.operationId,
            members
              .filter((member) => member.userId !== requesterId && member.telegramId)
              .map((member) => ({ telegramId: member.telegramId as string, message })),
            "reimbursement.cancelled",
          );
        }
        const deliveryKey = await enqueueReimbursementPrimaryResponse(
          transaction,
          context,
          identity.operationId,
          "✅ Reintegro cancelado. Se notificó al grupo.",
        );
        return { resourceType: "reimbursement", resourceId: id, result: { ok: true, deliveryKey } };
      },
    );
    if (operation.kind !== "committed" || !operation.result.ok || !operation.result.deliveryKey) {
      return { ok: false };
    }
    return {
      ok: true,
      deliveryOperationId: operation.operationId,
      deliveryKey: operation.result.deliveryKey,
    };
  }

  const reimbursement = await getReimbursementById(id);

  if (!reimbursement || reimbursement.status !== "pending" || reimbursement.requesterId !== requesterId) {
    return false;
  }

  const cancelled = await cancelReimbursement(id, requesterId);

  if (!cancelled) {
    return false;
  }

  const requester = await getUserById(requesterId);
  const requesterName = requester?.name ?? "Alguien";

  // Get the transaction to find the groupId
  const [transaction] = await db
    .select({ groupId: transactions.group_id })
    .from(transactions)
    .where(eq(transactions.id, reimbursement.transactionId));

  if (transaction?.groupId) {
    // Notify all group members except the requester
    const { notifyReimbursementCancelled } = await import("@/lib/notifications/telegram");
    await notifyReimbursementCancelled(
      transaction.groupId,
      requesterId,
      requesterName,
      reimbursement.amount,
    );
  }

  return true;
}

/**
 * Retrieves a reimbursement request by its identifier.
 *
 * @param id - Reimbursement request identifier.
 * @returns The reimbursement request when found, otherwise null.
 */
export async function getReimbursementById(id: string): Promise<ReimbursementRequest | null> {
  const [row] = await db.select().from(reimbursementRequests).where(eq(reimbursementRequests.id, id));

  return row ? mapReimbursementRequestRow(row) : null;
}

/**
 * Retrieves a reimbursement request by transaction ID.
 * Useful for checking if a reimbursement already exists for a transaction.
 *
 * @param transactionId - Transaction identifier.
 * @returns The reimbursement request when found, otherwise null.
 */
export async function getReimbursementByTransactionId(transactionId: string): Promise<ReimbursementRequest | null> {
  const [row] = await db
    .select()
    .from(reimbursementRequests)
    .where(eq(reimbursementRequests.transactionId, transactionId))
    .orderBy(desc(reimbursementRequests.createdAt));

  return row ? mapReimbursementRequestRow(row) : null;
}
