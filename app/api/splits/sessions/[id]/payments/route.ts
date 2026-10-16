import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { split_items, split_payers, split_payments, split_session_members, split_sessions, splits } from "@/lib/db/schema";
import { calculateSessionBalances } from "@/lib/splits/balances";

const createSchema = z.object({
  operationId: z.uuid(),
  payerUserId: z.string().min(1),
  payeeUserId: z.string().min(1).optional(),
  payeeTempId: z.string().min(1).optional(),
  amount: z.number().positive().refine((amount) =>
    Number.isSafeInteger(Math.round(amount * 100))
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6),
  method: z.literal("manual").default("manual"),
}).strict().refine((value) => Boolean(value.payeeUserId) !== Boolean(value.payeeTempId), {
  message: "Debe indicarse exactamente una persona acreedora",
});

type PaymentInput = z.infer<typeof createSchema>;
type PersistedPayment = typeof split_payments.$inferSelect;

function matchesReplay(row: PersistedPayment, sessionId: string, actorId: string, input: PaymentInput): boolean {
  return row.session_id === sessionId
    && row.payer_user_id === actorId
    && row.payer_temp_id === null
    && row.payee_user_id === (input.payeeUserId ?? null)
    && row.payee_temp_id === (input.payeeTempId ?? null)
    && row.amount === input.amount
    && row.method === "manual";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actorId = req.headers.get("x-user-id");
    if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: sessionId } = await params;
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;
    if (input.payerUserId !== actorId) {
      return NextResponse.json({ error: "Solo podés registrar tu propio pago" }, { status: 403 });
    }
    if (input.payeeUserId === actorId) {
      return NextResponse.json({ error: "No podés pagarte a vos mismo" }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const [session] = await tx.select().from(split_sessions).where(eq(split_sessions.id, sessionId)).limit(1);
      if (!session) return { error: "Not found", status: 404 } as const;
      const members = await tx.select().from(split_session_members)
        .where(eq(split_session_members.session_id, sessionId));
      if (!members.some((member) => member.user_id === actorId)) {
        return { error: "Forbidden", status: 403 } as const;
      }

      const [previous] = await tx.select().from(split_payments)
        .where(eq(split_payments.operation_id, input.operationId)).limit(1);
      if (previous) {
        if (!matchesReplay(previous, sessionId, actorId, input)) {
          return { error: "Operation key already used", status: 409 } as const;
        }
        return { payment: previous, replayed: true } as const;
      }

      if (session.status !== "open") return { error: "Session is closed", status: 400 } as const;
      const payeeIsMember = members.some((member) => input.payeeUserId
        ? member.user_id === input.payeeUserId
        : member.temp_user_id === input.payeeTempId);
      if (!payeeIsMember) return { error: "Creditor outside session", status: 400 } as const;

      const activeSplits = await tx.select({ id: splits.id }).from(splits)
        .where(and(eq(splits.session_id, sessionId), eq(splits.status, "active")));
      if (activeSplits.length === 0) return { error: "No outstanding debt", status: 400 } as const;
      const splitIds = activeSplits.map((split) => split.id);
      const [payerRows, itemRows, paymentRows] = await Promise.all([
        tx.select().from(split_payers).where(inArray(split_payers.split_id, splitIds)),
        tx.select().from(split_items).where(inArray(split_items.split_id, splitIds)),
        tx.select().from(split_payments).where(and(
          eq(split_payments.session_id, sessionId), isNotNull(split_payments.confirmed_at))),
      ]);
      const balance = calculateSessionBalances(
        payerRows.map((row) => ({
          userId: row.user_id ?? undefined, tempUserId: row.temp_user_id ?? undefined,
          amountPaid: row.amount_paid,
        })),
        itemRows.map((row) => ({
          userId: row.user_id ?? undefined, tempUserId: row.temp_user_id ?? undefined,
          amountOwed: row.amount_owed,
        })),
        paymentRows.map((row) => ({
          payerUserId: row.payer_user_id, payerTempId: row.payer_temp_id,
          payeeUserId: row.payee_user_id, payeeTempId: row.payee_temp_id,
          amount: row.amount,
        })),
      );
      const debt = balance.debts.find((entry) =>
        entry.from.userId === actorId
        && (input.payeeUserId
          ? entry.to.userId === input.payeeUserId
          : entry.to.tempUserId === input.payeeTempId));
      if (!debt || Math.round(input.amount * 100) > Math.round(debt.amount * 100)) {
        return { error: "Payment exceeds outstanding debt", status: 400 } as const;
      }

      const payment = {
        id: randomUUID(), operation_id: input.operationId, session_id: sessionId,
        payer_user_id: actorId, payer_temp_id: null,
        payee_user_id: input.payeeUserId ?? null,
        payee_temp_id: input.payeeTempId ?? null,
        amount: input.amount, method: "manual" as const,
        receipt_image_url: null, ocr_raw_text: null,
        confirmed_at: Date.now(), telegram_update_id: null,
      };
      const inserted = await tx.insert(split_payments).values(payment)
        .onConflictDoNothing().returning({ id: split_payments.id });
      if (inserted.length === 0) {
        const [winner] = await tx.select().from(split_payments)
          .where(eq(split_payments.operation_id, input.operationId)).limit(1);
        if (!winner) return { error: "Payment could not be confirmed", status: 500 } as const;
        if (!matchesReplay(winner, sessionId, actorId, input)) {
          return { error: "Operation key already used", status: 409 } as const;
        }
        return { payment: winner, replayed: true } as const;
      }
      return { payment, replayed: false } as const;
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.payment, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    console.error("Error recording split payment:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
