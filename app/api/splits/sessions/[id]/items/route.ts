// app/api/splits/sessions/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, splits, split_payers, split_items, split_session_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { allocationIdentity, splitAllocationSchema, validSplitAllocation } from "@/lib/splits/allocation-contract";

const createSchema = splitAllocationSchema.extend({
  description: z.string().min(1).max(200),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: sessionId } = await params;
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { description, totalAmount, splitType, payers, participants } = parsed.data;
    if (!validSplitAllocation(parsed.data)) {
      return NextResponse.json({ error: "Invalid split allocation" }, { status: 400 });
    }
    const splitId = randomUUID();
    const now = Date.now();

    const result = await db.transaction(async tx => {
      const [session] = await tx.select().from(split_sessions).where(eq(split_sessions.id, sessionId));
      if (!session) return { error: "Not found", status: 404 } as const;
      const members = await tx.select().from(split_session_members)
        .where(eq(split_session_members.session_id, sessionId));
      if (!members.some(member => member.user_id === userId)) {
        return { error: "Forbidden", status: 403 } as const;
      }
      if (session.status !== "open") return { error: "Session is closed", status: 400 } as const;
      const memberIds = new Set(members.map(member =>
        member.user_id ? `user:${member.user_id}` : `temp:${member.temp_user_id}`));
      if ([...payers, ...participants].some(value => !memberIds.has(allocationIdentity(value)))) {
        return { error: "Identity outside session", status: 400 } as const;
      }

      await tx.insert(splits).values({
        id: splitId, session_id: sessionId, description,
        total_amount: totalAmount, split_type: splitType,
        created_by_user_id: userId, created_at: now,
      });
      await tx.insert(split_payers).values(payers.map(p => ({
        id: randomUUID(), split_id: splitId,
        user_id: p.userId ?? null, temp_user_id: p.tempUserId ?? null,
        amount_paid: p.amountPaid,
      })));
      await tx.insert(split_items).values(participants.map(p => ({
        id: randomUUID(), split_id: splitId,
        user_id: p.userId ?? null, temp_user_id: p.tempUserId ?? null,
        amount_owed: p.amount, percentage: p.percentage ?? null,
      })));
      return { ok: true } as const;
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ id: splitId, description, totalAmount, splitType }, { status: 201 });
  } catch (err) {
    console.error("Error creating split item:", err instanceof Error ? err.name : "Unknown error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
