// app/api/splits/items/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splits, split_sessions, split_payments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  totalAmount: z.number().positive().optional(),
  status: z.literal("cancelled").optional(),
}).strict().refine(value =>
  (value.totalAmount !== undefined) !== (value.status === "cancelled"), {
  message: "Choose exactly one change",
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const { id } = await params;
    const result = await db.transaction(async tx => {
      const [split] = await tx.select().from(splits).where(eq(splits.id, id));
      if (!split) return { error: "Not found", status: 404 } as const;
      const [session] = await tx.select().from(split_sessions)
        .where(eq(split_sessions.id, split.session_id));
      if (!session || session.owner_user_id !== userId) {
        return { error: "Forbidden", status: 403 } as const;
      }
      if (split.status === "cancelled" && parsed.data.status === "cancelled") {
        return { ok: true } as const;
      }
      if (session.status !== "open") return { error: "Session is closed", status: 409 } as const;
      if (split.status !== "active") return { error: "Split is not active", status: 409 } as const;

      // A total-only edit would break sum(payers) = sum(items) = total.
      // A future edit must replace allocations in the same transaction.
      if (parsed.data.totalAmount !== undefined) {
        return { error: "Allocation replacement required", status: 409 } as const;
      }

      // Payments belong to the session, not a split. Their attribution is
      // unknown, so cancellation after any payment must fail closed.
      const [payment] = await tx.select({ id: split_payments.id }).from(split_payments)
        .where(eq(split_payments.session_id, split.session_id)).limit(1);
      if (payment) return { error: "Session has payments", status: 409 } as const;

      await tx.update(splits).set({ status: "cancelled", cancelled_at: Date.now() })
        .where(and(eq(splits.id, id), eq(splits.status, "active")));
      return { ok: true } as const;
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error updating split:", err instanceof Error ? err.name : "Unknown error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
