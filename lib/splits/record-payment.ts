import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { LibSQLTransaction } from "drizzle-orm/libsql";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { split_items, split_payers, split_payments, split_session_members, split_sessions, splits } from "@/lib/db/schema";
import { calculateSessionBalances } from "./balances";
import { confirmedPaymentsForSession } from "./confirmed-payments";

export interface ManualSplitPaymentInput {
  operationId: string;
  sessionId: string;
  actorId?: string;
  actorTempId?: string;
  payeeUserId?: string;
  payeeTempId?: string;
  amount: number;
}

type Payment = typeof split_payments.$inferSelect;
export type SplitPaymentTransaction = LibSQLTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface ManualSplitPaymentOptions {
  onRecorded?: (transaction: SplitPaymentTransaction, payment: Payment,
    remainingDebt: number, sessionName: string) => Promise<void>;
}

type RecordPaymentResult =
  | { error: string; status: 400 | 403 | 404 | 409 | 500 }
  | { payment: Payment; replayed: true; remainingDebt: null; sessionName: string }
  | { payment: Payment; replayed: false; remainingDebt: number; sessionName: string };

function matchesReplay(row: Payment, input: ManualSplitPaymentInput): boolean {
  return row.session_id === input.sessionId
    && row.payer_user_id === (input.actorId ?? null)
    && row.payer_temp_id === (input.actorTempId ?? null)
    && row.payee_user_id === (input.payeeUserId ?? null)
    && row.payee_temp_id === (input.payeeTempId ?? null)
    && row.amount === input.amount
    && row.method === "manual";
}

// The caller owns the transaction so Telegram can commit the payment and its
// deliveries with the same operation claim. Never notify from this writer.
export async function recordManualSplitPaymentInTransaction(
  tx: SplitPaymentTransaction,
  input: ManualSplitPaymentInput,
  options: ManualSplitPaymentOptions = {},
): Promise<RecordPaymentResult> {
    const onePayer = Boolean(input.actorId) !== Boolean(input.actorTempId);
    const oneCreditor = Boolean(input.payeeUserId) !== Boolean(input.payeeTempId);
    if (!onePayer || !oneCreditor || (input.actorId && input.actorId === input.payeeUserId)
      || (input.actorTempId && input.actorTempId === input.payeeTempId)
      || input.amount <= 0
      || !Number.isSafeInteger(Math.round(input.amount * 100))
      || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) >= 1e-7) {
      return { error: "Invalid payment", status: 400 };
    }
    const [session] = await tx.select().from(split_sessions)
      .where(eq(split_sessions.id, input.sessionId)).limit(1);
    if (!session) return { error: "Not found", status: 404 } as const;

    const members = await tx.select().from(split_session_members)
      .where(eq(split_session_members.session_id, input.sessionId));
    if (!members.some((member) => input.actorId
      ? member.user_id === input.actorId
      : member.temp_user_id === input.actorTempId)) {
      return { error: "Forbidden", status: 403 } as const;
    }

    const [previous] = await tx.select().from(split_payments)
      .where(eq(split_payments.operation_id, input.operationId)).limit(1);
    if (previous) {
      if (!matchesReplay(previous, input)) {
        return { error: "Operation key already used", status: 409 } as const;
      }
      return { payment: previous, replayed: true, remainingDebt: null, sessionName: session.name } as const;
    }

    if (session.status !== "open") return { error: "Session is closed", status: 400 } as const;
    const payeeIsMember = members.some((member) => input.payeeUserId
      ? member.user_id === input.payeeUserId
      : member.temp_user_id === input.payeeTempId);
    if (!payeeIsMember) return { error: "Creditor outside session", status: 400 } as const;

    const activeSplits = await tx.select({ id: splits.id }).from(splits)
      .where(and(eq(splits.session_id, input.sessionId), eq(splits.status, "active")));
    if (activeSplits.length === 0) return { error: "No outstanding debt", status: 400 } as const;
    const splitIds = activeSplits.map((split) => split.id);
    const [payerRows, itemRows, paymentRows] = await Promise.all([
      tx.select().from(split_payers).where(inArray(split_payers.split_id, splitIds)),
      tx.select().from(split_items).where(inArray(split_items.split_id, splitIds)),
      tx.select().from(split_payments).where(confirmedPaymentsForSession(input.sessionId)),
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
      (input.actorId ? entry.from.userId === input.actorId : entry.from.tempUserId === input.actorTempId)
      && (input.payeeUserId
        ? entry.to.userId === input.payeeUserId
        : entry.to.tempUserId === input.payeeTempId));
    if (!debt || Math.round(input.amount * 100) > Math.round(debt.amount * 100)) {
      return { error: "Payment exceeds outstanding debt", status: 400 } as const;
    }

    const payment: Payment = {
      id: randomUUID(), operation_id: input.operationId, session_id: input.sessionId,
      payer_user_id: input.actorId ?? null, payer_temp_id: input.actorTempId ?? null,
      payee_user_id: input.payeeUserId ?? null,
      payee_temp_id: input.payeeTempId ?? null,
      amount: input.amount, method: "manual",
      receipt_image_url: null, ocr_raw_text: null,
      confirmed_at: Date.now(), telegram_update_id: null,
    };
    const inserted = await tx.insert(split_payments).values(payment)
      .onConflictDoNothing().returning({ id: split_payments.id });
    if (inserted.length === 0) {
      const [winner] = await tx.select().from(split_payments)
        .where(eq(split_payments.operation_id, input.operationId)).limit(1);
      if (!winner) return { error: "Payment could not be confirmed", status: 500 } as const;
      if (!matchesReplay(winner, input)) {
        return { error: "Operation key already used", status: 409 } as const;
      }
      return { payment: winner, replayed: true, remainingDebt: null, sessionName: session.name } as const;
    }
    const remainingDebt = Math.round((debt.amount - input.amount) * 100) / 100;
    await options.onRecorded?.(tx, payment, remainingDebt, session.name);
    return {
      payment,
      replayed: false as const,
      remainingDebt,
      sessionName: session.name,
    };
}

// The debt check and insert share one libSQL transaction. Neither caller may
// notify until this returns a newly committed payment.
export async function recordManualSplitPayment(
  input: ManualSplitPaymentInput,
  options: ManualSplitPaymentOptions = {},
): Promise<RecordPaymentResult> {
  return db.transaction((tx) => recordManualSplitPaymentInTransaction(tx, input, options)).catch((error: unknown) => {
    // A competing writer may hold the local SQLite/libSQL write lock. Do not
    // retry an uncertain transaction or report the payment as registered.
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (typeof code === "string" && code.startsWith("SQLITE_BUSY")) {
      return { error: "Concurrent payment; check balance before retry", status: 409 };
    }
    throw error;
  });
}
