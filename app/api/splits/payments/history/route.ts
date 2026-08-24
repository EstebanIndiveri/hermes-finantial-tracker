import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { getPaymentHistoryForUser } from "@/lib/splits/payment-history";

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerId = req.nextUrl.searchParams.get("partnerId") ?? "";
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");

  if ((from && !isValidDate(from)) || (to && !isValidDate(to)) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const result = await getPaymentHistoryForUser(userId, {
    partnerId: partnerId || undefined,
    from: from || undefined,
    to: to || undefined,
    limit,
    offset,
  });

  return NextResponse.json({
    items: result.items,
    total: result.total,
    limit,
    offset,
  });
}
