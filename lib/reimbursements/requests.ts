import { db } from "@/lib/db/client";
import { reimbursementRequests } from "@/lib/db/schema";
import { and, desc, eq, or } from "drizzle-orm";
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
 * Marks a reimbursement as paid when it belongs to the given payer.
 *
 * @param id - Reimbursement request identifier.
 * @param payerId - User identifier of the payer.
 * @returns Whether a reimbursement request was updated.
 */
export async function markReimbursementAsPaid(id: string, payerId: string): Promise<boolean> {
  const updatedRows = await db
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

  return updatedRows.length > 0;
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
 * Retrieves a reimbursement request by its identifier.
 *
 * @param id - Reimbursement request identifier.
 * @returns The reimbursement request when found, otherwise null.
 */
export async function getReimbursementById(id: string): Promise<ReimbursementRequest | null> {
  const [row] = await db.select().from(reimbursementRequests).where(eq(reimbursementRequests.id, id));

  return row ? mapReimbursementRequestRow(row) : null;
}
