import { db } from "@/lib/db/client";
import { categories, groups, reimbursementRequests, transactions } from "@/lib/db/schema";
import {
  getUserById,
  notifyGroupOfReimbursementRequest,
  notifyReimbursementPaid,
} from "@/lib/notifications/telegram";
import { sendPushToUser } from "@/lib/notifications/web-push";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { nanoid } from "nanoid";

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
export async function createReimbursementWithNotifications(
  transactionId: string,
  requesterId: string,
  amount: number,
  payerId?: string,
): Promise<ReimbursementRequest | { error: string }> {
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
export async function markReimbursementAsPaidWithNotifications(
  id: string,
  payerId: string,
): Promise<boolean> {
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
export async function cancelReimbursementWithNotifications(
  id: string,
  requesterId: string,
): Promise<boolean> {
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
