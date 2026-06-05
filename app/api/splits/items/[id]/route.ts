// app/api/splits/items/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splits, split_sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  totalAmount: z.number().positive().optional(),
  status: z.literal("cancelled").optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const split = await db.query.splits.findFirst({ where: eq(splits.id, id) });
    if (!split) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, split.session_id),
    });
    if (!session || session.owner_user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (parsed.data.status === "cancelled") {
      updates.status = "cancelled";
      updates.cancelled_at = Date.now();
    }
    if (parsed.data.totalAmount !== undefined) {
      updates.total_amount = parsed.data.totalAmount;
    }

    await db.update(splits).set(updates).where(eq(splits.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error updating split:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
