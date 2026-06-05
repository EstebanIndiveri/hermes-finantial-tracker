// app/api/splits/sessions/[id]/balances/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, splits, split_payers, split_items, split_payments } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { calculateSessionBalances } from "@/lib/splits/balances";
import type { RawPayer, RawItem, RawPayment } from "@/lib/splits/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, id),
    });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Fetch all active splits for session
    const activeSplits = await db.query.splits.findMany({
      where: and(eq(splits.session_id, id), eq(splits.status, "active")),
    });
    const splitIds = activeSplits.map(s => s.id);

    if (splitIds.length === 0) {
      return NextResponse.json({ balances: [], debts: [], isSettled: true });
    }

    // Fetch payers, items, payments in parallel
    const [payerRows, itemRows, paymentRows] = await Promise.all([
      db.select().from(split_payers).where(inArray(split_payers.split_id, splitIds)),
      db.select().from(split_items).where(inArray(split_items.split_id, splitIds)),
      db.select().from(split_payments).where(eq(split_payments.session_id, id)),
    ]);

    const rawPayers: RawPayer[] = payerRows.map(r => ({
      userId: r.user_id ?? undefined,
      tempUserId: r.temp_user_id ?? undefined,
      amountPaid: r.amount_paid,
    }));
    const rawItems: RawItem[] = itemRows.map(r => ({
      userId: r.user_id ?? undefined,
      tempUserId: r.temp_user_id ?? undefined,
      amountOwed: r.amount_owed,
    }));
    const rawPayments: RawPayment[] = paymentRows.map(r => ({
      payerUserId: r.payer_user_id ?? undefined,
      payerTempId: r.payer_temp_id ?? undefined,
      payeeUserId: r.payee_user_id ?? undefined,
      payeeTempId: r.payee_temp_id ?? undefined,
      amount: r.amount,
    }));

    const result = calculateSessionBalances(rawPayers, rawItems, rawPayments);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error calculating balances:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
