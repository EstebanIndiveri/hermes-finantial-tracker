import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { verifySession } from "@/lib/auth/session";
import { getSessionCookieName } from "@/lib/auth/session-cookie";
import { db } from "@/lib/db/client";
import { split_payments, split_session_members, split_sessions, users } from "@/lib/db/schema";
import { notifySplitPaymentReceived } from "@/lib/notifications/telegram";
import { calculateGlobalBalances } from "@/lib/splits/global-balances";

const createPaymentSchema = z.object({
  operationId: z.uuid(),
  payeeUserId: z.string().optional(),
  payeeTempId: z.string().optional(),
  amount: z.number().positive().refine((amount) => Number.isSafeInteger(Math.round(amount * 100)) && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6),
  sessionId: z.string().optional(),
}).refine((value) => Boolean(value.payeeUserId || value.payeeTempId), {
  message: "Debe indicarse una persona acreedora",
  path: ["payeeUserId"],
});

function getDisplayName(person: { username?: string | null; name?: string | null } | null): string {
  if (!person) return "Alguien";
  return person.username || person.name || "Alguien";
}

type PersistedPayment = typeof split_payments.$inferSelect;

function matchesReplay(payment: PersistedPayment, actorId: string, payeeUserId: string | undefined, sessionId: string | undefined, amount: number): boolean {
  return payment.payer_user_id === actorId
    && payment.payer_temp_id === null
    && payment.payee_user_id === payeeUserId
    && payment.payee_temp_id === null
    && payment.amount === amount
    && (!sessionId || payment.session_id === sessionId);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(getSessionCookieName())?.value;
  const userId = cookie ? await verifySession(cookie) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { operationId, payeeUserId, payeeTempId, amount, sessionId } = parsed.data;
  const previous = await db.query.split_payments.findFirst({ where: eq(split_payments.operation_id, operationId) });
  if (previous) {
    const membership = await db.query.split_session_members.findFirst({
      where: and(eq(split_session_members.session_id, previous.session_id), eq(split_session_members.user_id, userId)),
    });
    if (!membership) return NextResponse.json({ error: "No tenés acceso a esa sesión" }, { status: 403 });
    if (!matchesReplay(previous, userId, payeeUserId, sessionId, amount)) {
      return NextResponse.json({ error: "La clave de operación ya se usó para otro pago" }, { status: 409 });
    }
    return NextResponse.json({ success: true, replayed: true, notificationFailed: null, remainingDebt: null, recordedAmount: amount, sessionId: previous.session_id });
  }
  const global = await calculateGlobalBalances(userId);
  const matchingDebt = global.youOwe.find((debt) =>
    (payeeUserId ? debt.to.userId === payeeUserId : debt.to.tempUserId === payeeTempId)
    && (!sessionId || debt.sessionIds.includes(sessionId)),
  );

  if (!matchingDebt) {
    return NextResponse.json({ error: "No se encontró deuda pendiente con esa persona" }, { status: 404 });
  }

  if (!payeeUserId) {
    return NextResponse.json({ error: "Por ahora solo se pueden registrar pagos a usuarios de Hermes" }, { status: 400 });
  }

  const partnerBalance = global.partnerBalances.find((partner) => partner.partner.userId === payeeUserId);
  const maxAmount = sessionId
    ? Math.abs(partnerBalance?.sessionBreakdown.find((session) => session.sessionId === sessionId)?.net ?? 0)
    : matchingDebt.amount;

  if (amount > maxAmount) {
    return NextResponse.json({ error: "El monto supera la deuda pendiente" }, { status: 400 });
  }

  const targetSessionId = sessionId ?? matchingDebt.sessionIds[0];
  const [session, membership] = await Promise.all([
    db.query.split_sessions.findFirst({ where: eq(split_sessions.id, targetSessionId) }),
    db.query.split_session_members.findFirst({ where: and(eq(split_session_members.session_id, targetSessionId), eq(split_session_members.user_id, userId)) }),
  ]);

  if (!session) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }

  if (!membership) {
    return NextResponse.json({ error: "No tenés acceso a esa sesión" }, { status: 403 });
  }

  const inserted = await db.insert(split_payments).values({
    id: randomUUID(),
    operation_id: operationId,
    session_id: targetSessionId,
    payer_user_id: userId,
    payer_temp_id: null,
    payee_user_id: payeeUserId,
    payee_temp_id: null,
    amount,
    method: "manual",
    receipt_image_url: null,
    ocr_raw_text: null,
    confirmed_at: Date.now(),
    telegram_update_id: null,
  }).onConflictDoNothing().returning({ id: split_payments.id });
  if (inserted.length === 0) {
    const winner = await db.query.split_payments.findFirst({ where: eq(split_payments.operation_id, operationId) });
    if (!winner) return NextResponse.json({ error: "No se pudo confirmar el pago" }, { status: 500 });
    const winnerMembership = await db.query.split_session_members.findFirst({
      where: and(eq(split_session_members.session_id, winner.session_id), eq(split_session_members.user_id, userId)),
    });
    if (!winnerMembership) return NextResponse.json({ error: "No tenés acceso a esa sesión" }, { status: 403 });
    if (!matchesReplay(winner, userId, payeeUserId, sessionId, amount)) {
      return NextResponse.json({ error: "La clave de operación ya se usó para otro pago" }, { status: 409 });
    }
    return NextResponse.json({ success: true, replayed: true, notificationFailed: null, remainingDebt: null, recordedAmount: amount, sessionId: winner.session_id });
  }

  const remainingDebt = Math.round((maxAmount - amount) * 100) / 100;
  let notificationFailed = false;
  try {
    const payer = await db.query.users.findFirst({ where: eq(users.id, userId) });
    await notifySplitPaymentReceived(payeeUserId, getDisplayName(payer ?? null), amount, remainingDebt, session.name);
  } catch {
    notificationFailed = true;
    console.error("Split payment notification failed after commit", { operationId });
  }

  return NextResponse.json({ success: true, replayed: false, notificationFailed, remainingDebt, recordedAmount: amount, sessionId: targetSessionId });
}
