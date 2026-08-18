import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import {
  createReimbursementRequest,
  getReimbursementsByUser,
} from "@/lib/reimbursements/requests";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reimbursements = await getReimbursementsByUser(userId);
  return NextResponse.json(reimbursements);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const transactionId = typeof body?.transactionId === "string" ? body.transactionId : "";
  const amount = body?.amount;
  const payerId = typeof body?.payerId === "string" ? body.payerId : undefined;

  if (!transactionId || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "transactionId and positive amount required" }, { status: 400 });
  }

  const request = await createReimbursementRequest(transactionId, userId, amount, payerId);
  return NextResponse.json(request);
}
