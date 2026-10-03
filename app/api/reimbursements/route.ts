import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { getSessionCookieName } from "@/lib/auth/session-cookie";
import {
  createVerifiedWebReimbursement,
  getReimbursementsByUser,
} from "@/lib/reimbursements/requests";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(getSessionCookieName())?.value;
  const userId = cookie ? await verifySession(cookie) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reimbursements = await getReimbursementsByUser(userId);
  return NextResponse.json(reimbursements);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(getSessionCookieName())?.value;
  const userId = cookie ? await verifySession(cookie) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const transactionId = typeof body?.transactionId === "string" ? body.transactionId : "";
  const amount = body?.amount;
  const payerId = typeof body?.payerId === "string" ? body.payerId : undefined;

  if (!transactionId || (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0))) {
    return NextResponse.json({ error: "transactionId and optional positive amount required" }, { status: 400 });
  }

  const result = await createVerifiedWebReimbursement(transactionId, userId, amount, payerId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
