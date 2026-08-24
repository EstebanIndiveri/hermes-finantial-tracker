import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { verifySession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { split_payments, split_session_members, split_sessions, users } from "@/lib/db/schema";
import { notifySplitPaymentReceived } from "@/lib/notifications/telegram";
import { calculateGlobalBalances } from "@/lib/splits/global-balances";

const createPaymentSchema = z.object({
  payeeUserId: z.string().optional(),
  payeeTempId: z.string().optional(),
  amount: z.number().positive(),
  sessionId: z.string().optional(),
}).refine((value) => Boolean(value.payeeUserId || value.payeeTempId), {
  message: "Debe indicarse una persona acreedora",
  path: ["payeeUserId"],
});

function getDisplayName(person: { username?: string | null; name?: string | null } | null): string {
  if (!person) return "Alguien";
  return person.username || person.name || "Alguien";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { payeeUserId, payeeTempId, amount, sessionId } = parsed.data;
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

  await db.insert(split_payments).values({
    id: randomUUID(),
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
  });

  const remainingDebt = Math.round((maxAmount - amount) * 100) / 100;
  const payer = await db.query.users.findFirst({ where: eq(users.id, userId) });
  await notifySplitPaymentReceived(payeeUserId, getDisplayName(payer ?? null), amount, remainingDebt, session.name);

  return NextResponse.json({ success: true, remainingDebt, recordedAmount: amount, sessionId: targetSessionId });
}
