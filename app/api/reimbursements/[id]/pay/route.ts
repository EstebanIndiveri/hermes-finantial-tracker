import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { transactions, group_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getReimbursementById,
  markReimbursementAsPaidWithNotifications,
} from "@/lib/reimbursements/requests";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reimbursement = await getReimbursementById(id);

  if (!reimbursement) {
    return NextResponse.json({ error: "Reimbursement not found" }, { status: 404 });
  }

  if (reimbursement.status !== "pending") {
    return NextResponse.json({ error: "Reimbursement is not pending" }, { status: 400 });
  }

  // Check authorization:
  // 1. If payerId is set, only that user can pay
  // 2. If payerId is NULL (open), any group member can pay (except requester)
  if (reimbursement.payerId !== null && reimbursement.payerId !== userId) {
    return NextResponse.json({ error: "Not authorized to pay this reimbursement" }, { status: 403 });
  }

  // For open reimbursements, verify user is a group member and not the requester
  if (reimbursement.payerId === null) {
    if (reimbursement.requesterId === userId) {
      return NextResponse.json({ error: "Cannot pay your own reimbursement" }, { status: 403 });
    }

    // Get the group from the transaction
    const [tx] = await db
      .select({ groupId: transactions.group_id })
      .from(transactions)
      .where(eq(transactions.id, reimbursement.transactionId));

    if (tx?.groupId) {
      const membership = await db.query.group_members.findFirst({
        where: and(
          eq(group_members.group_id, tx.groupId),
          eq(group_members.user_id, userId),
        ),
      });

      if (!membership) {
        return NextResponse.json({ error: "Not a group member" }, { status: 403 });
      }
    }
  }

  const paid = await markReimbursementAsPaidWithNotifications(id, userId);

  if (!paid) {
    return NextResponse.json({ error: "Failed to mark as paid" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
