// app/api/splits/sessions/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, splits, split_payers, split_items, split_session_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const identitySchema = z.object({
  userId: z.string().min(1).optional(),
  tempUserId: z.string().min(1).optional(),
}).refine(value => Boolean(value.userId) !== Boolean(value.tempUserId), {
  message: "Exactly one identity is required",
});

const participantSchema = identitySchema.safeExtend({
  amount: z.number().positive(),
  percentage: z.number().optional(),
});

const payerSchema = identitySchema.safeExtend({
  amountPaid: z.number().positive(),
});

const createSchema = z.object({
  description: z.string().min(1).max(200),
  totalAmount: z.number().positive(),
  splitType: z.enum(["equal", "percentage", "fixed"]),
  payers: z.array(payerSchema).min(1),
  participants: z.array(participantSchema).min(1),
});

function toCents(amount: number): number | null {
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && Number.isSafeInteger(cents) &&
    Math.abs(amount * 100 - cents) < 1e-7 ? cents : null;
}

function identity(value: { userId?: string; tempUserId?: string }): string {
  return value.userId ? `user:${value.userId}` : `temp:${value.tempUserId}`;
}

function validAllocation(input: z.infer<typeof createSchema>): boolean {
  const total = toCents(input.totalAmount);
  if (total === null || total <= 0) return false;
  for (const entries of [input.payers, input.participants]) {
    if (new Set(entries.map(identity)).size !== entries.length) return false;
  }
  const paid = input.payers.map(p => toCents(p.amountPaid));
  const owed = input.participants.map(p => toCents(p.amount));
  if ([...paid, ...owed].some(value => value === null || value <= 0)) return false;
  if (paid.reduce<number>((sum, value) => sum + (value ?? 0), 0) !== total ||
      owed.reduce<number>((sum, value) => sum + (value ?? 0), 0) !== total) return false;

  if (input.splitType !== "percentage") {
    return input.participants.every(p => p.percentage === undefined);
  }
  const basisPoints = input.participants.map(p =>
    p.percentage === undefined ? null : toCents(p.percentage));
  if (basisPoints.some(value => value === null || value <= 0) ||
      basisPoints.reduce<number>((sum, value) => sum + (value ?? 0), 0) !== 10_000) return false;
  return owed.every((value, index) =>
    Math.abs((value ?? 0) - Math.round(total * (basisPoints[index] ?? 0) / 10_000)) <= 1);
}

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
    if (!validAllocation(parsed.data)) {
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
      if ([...payers, ...participants].some(value => !memberIds.has(identity(value)))) {
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
