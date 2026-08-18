import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";
import {
  addPaymentInfo,
  deletePaymentInfo,
  getUserPaymentInfo,
  type PaymentMethod,
} from "@/lib/reimbursements/payment-info";

const validPaymentMethods: PaymentMethod[] = ["cbu", "alias", "efectivo"];

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get("hermes_session")?.value;
  return cookie ? verifySession(cookie) : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const info = await getUserPaymentInfo(userId);
  return NextResponse.json(info);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const method = typeof body?.method === "string" ? body.method : null;
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  const isDefault = body?.isDefault === true;

  if (!method || !validPaymentMethods.includes(method as PaymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  if (method !== "efectivo" && value.length === 0) {
    return NextResponse.json({ error: "Value required for CBU/Alias" }, { status: 400 });
  }

  const info = await addPaymentInfo(
    userId,
    method as PaymentMethod,
    method === "efectivo" ? null : value,
    isDefault,
  );

  return NextResponse.json(info);
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  const deleted = await deletePaymentInfo(id, userId);
  return NextResponse.json({ deleted });
}
