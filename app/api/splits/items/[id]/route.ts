// app/api/splits/items/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { splits, split_sessions, split_session_members, split_payments, split_payers, split_items } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { allocationIdentity, splitAllocationSchema, validSplitAllocation } from "@/lib/splits/allocation-contract";

const patchSchema = z.union([
  z.object({ status: z.literal("cancelled") }).strict(),
  splitAllocationSchema.strict(),
  z.object({ totalAmount: z.number().positive() }).strict(),
]);

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
      const members = await tx.select().from(split_session_members)
        .where(eq(split_session_members.session_id, split.session_id));
      if (!members.some(member => member.user_id === userId)) {
        return { error: "Forbidden", status: 403 } as const;
      }
      if (split.status === "cancelled" && "status" in parsed.data) {
        return { ok: true } as const;
      }
      if (session.status !== "open") return { error: "Session is closed", status: 409 } as const;
      if (split.status !== "active") return { error: "Split is not active", status: 409 } as const;

      // Retain the legacy total-only shape as an explicit conflict.
      if (!("status" in parsed.data) && !("payers" in parsed.data)) {
        return { error: "Allocation replacement required", status: 409 } as const;
      }

      if ("payers" in parsed.data) {
        if (!validSplitAllocation(parsed.data)) {
          return { error: "Invalid split allocation", status: 400 } as const;
        }
        const memberIds = new Set(members.map(member =>
          member.user_id ? `user:${member.user_id}` : `temp:${member.temp_user_id}`));
        if ([...parsed.data.payers, ...parsed.data.participants]
          .some(value => !memberIds.has(allocationIdentity(value)))) {
          return { error: "Identity outside session", status: 400 } as const;
        }
      }

      // Payments belong to the session, not a split. Their attribution is
      // unknown, so either correction or cancellation must fail closed.
      const [payment] = await tx.select({ id: split_payments.id }).from(split_payments)
        .where(eq(split_payments.session_id, split.session_id)).limit(1);
      if (payment) return { error: "Session has payments", status: 409 } as const;

      if ("status" in parsed.data) {
        await tx.update(splits).set({ status: "cancelled", cancelled_at: Date.now() })
          .where(and(eq(splits.id, id), eq(splits.status, "active")));
      } else if ("payers" in parsed.data) {
        const { totalAmount, splitType, payers, participants } = parsed.data;
        await tx.delete(split_items).where(eq(split_items.split_id, id));
        await tx.delete(split_payers).where(eq(split_payers.split_id, id));
        await tx.insert(split_payers).values(payers.map(p => ({
          id: randomUUID(), split_id: id,
          user_id: p.userId ?? null, temp_user_id: p.tempUserId ?? null,
          amount_paid: p.amountPaid,
        })));
        await tx.insert(split_items).values(participants.map(p => ({
          id: randomUUID(), split_id: id,
          user_id: p.userId ?? null, temp_user_id: p.tempUserId ?? null,
          amount_owed: p.amount, percentage: p.percentage ?? null,
        })));
        await tx.update(splits).set({ total_amount: totalAmount, split_type: splitType })
          .where(and(eq(splits.id, id), eq(splits.status, "active")));
      }
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
