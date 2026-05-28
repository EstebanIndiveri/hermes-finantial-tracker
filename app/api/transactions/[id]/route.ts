import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, id), eq(transactions.user_id, userId)),
    });
    if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (tx.status === "deleted") return NextResponse.json({ error: "Already deleted" }, { status: 409 });

    await db.update(transactions)
      .set({ status: "deleted", deleted_at: Date.now() })
      .where(and(eq(transactions.id, id), eq(transactions.user_id, userId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error deleting transaction:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
