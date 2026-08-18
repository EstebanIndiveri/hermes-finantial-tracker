import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
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

  if (reimbursement.payerId !== userId) {
    return NextResponse.json({ error: "Not authorized to pay this reimbursement" }, { status: 403 });
  }

  if (reimbursement.status !== "pending") {
    return NextResponse.json({ error: "Reimbursement is not pending" }, { status: 400 });
  }

  const paid = await markReimbursementAsPaidWithNotifications(id, userId);

  if (!paid) {
    return NextResponse.json({ error: "Failed to mark as paid" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
