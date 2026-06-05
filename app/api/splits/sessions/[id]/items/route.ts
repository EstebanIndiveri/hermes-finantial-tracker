// app/api/splits/sessions/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, splits, split_payers, split_items } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const participantSchema = z.object({
  userId: z.string().optional(),
  tempUserId: z.string().optional(),
  amount: z.number().positive(),
  percentage: z.number().optional(),
});

const payerSchema = z.object({
  userId: z.string().optional(),
  tempUserId: z.string().optional(),
  amountPaid: z.number().positive(),
});

const createSchema = z.object({
  description: z.string().min(1).max(200),
  totalAmount: z.number().positive(),
  splitType: z.enum(["equal", "percentage", "fixed"]),
  payers: z.array(payerSchema).min(1),
  participants: z.array(participantSchema).min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: sessionId } = await params;
    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, sessionId),
    });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.status !== "open") {
      return NextResponse.json({ error: "Session is closed" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { description, totalAmount, splitType, payers, participants } = parsed.data;
    const splitId = randomUUID();
    const now = Date.now();

    await db.insert(splits).values({
      id: splitId, session_id: sessionId, description,
      total_amount: totalAmount, split_type: splitType,
      created_by_user_id: userId, created_at: now,
    });

    await db.insert(split_payers).values(
      payers.map(p => ({
        id: randomUUID(), split_id: splitId,
        user_id: p.userId ?? null, temp_user_id: p.tempUserId ?? null,
        amount_paid: p.amountPaid,
      }))
    );

    await db.insert(split_items).values(
      participants.map(p => ({
        id: randomUUID(), split_id: splitId,
        user_id: p.userId ?? null, temp_user_id: p.tempUserId ?? null,
        amount_owed: p.amount, percentage: p.percentage ?? null,
      }))
    );

    return NextResponse.json({ id: splitId, description, totalAmount, splitType }, { status: 201 });
  } catch (err) {
    console.error("Error creating split item:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
