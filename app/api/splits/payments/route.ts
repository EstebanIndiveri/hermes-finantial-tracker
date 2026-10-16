import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { verifySession } from "@/lib/auth/session";
import { getSessionCookieName } from "@/lib/auth/session-cookie";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { notifySplitPaymentReceived } from "@/lib/notifications/telegram";
import { recordManualSplitPayment } from "@/lib/splits/record-payment";

const createPaymentSchema = z.object({
  operationId: z.uuid(),
  payeeUserId: z.string().min(1),
  amount: z.number().positive().refine((amount) =>
    Number.isSafeInteger(Math.round(amount * 100))
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6),
  sessionId: z.string().min(1),
}).strict();

function getDisplayName(person: { username?: string | null; name?: string | null } | null): string {
  if (!person) return "Alguien";
  return person.username || person.name || "Alguien";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(getSessionCookieName())?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { operationId, payeeUserId, amount, sessionId } = parsed.data;
  if (payeeUserId === userId) {
    return NextResponse.json({ error: "No podés pagarte a vos mismo" }, { status: 400 });
  }

  try {
    const result = await recordManualSplitPayment({ operationId, sessionId, actorId: userId, payeeUserId, amount });
    if ("error" in result) {
      const messages: Record<string, string> = {
        "Not found": "Sesión no encontrada",
        Forbidden: "No tenés acceso a esa sesión",
        "Session is closed": "La sesión está cerrada",
        "Creditor outside session": "La persona acreedora no pertenece a la sesión",
        "No outstanding debt": "No se encontró deuda pendiente en la sesión",
        "Payment exceeds outstanding debt": "El monto supera la deuda pendiente",
        "Operation key already used": "La clave de operación ya se usó para otro pago",
        "Payment could not be confirmed": "No se pudo confirmar el pago",
        "Concurrent payment; check balance before retry": "Otro pago está en curso; revisá el saldo antes de reintentar",
      };
      return NextResponse.json({ error: messages[result.error] ?? "No se pudo registrar el pago" }, { status: result.status });
    }

    if (result.replayed) {
      return NextResponse.json({ success: true, replayed: true, notificationFailed: null,
        remainingDebt: null, recordedAmount: amount, sessionId });
    }

    let notificationFailed = false;
    try {
      const payer = await db.query.users.findFirst({ where: eq(users.id, userId) });
      await notifySplitPaymentReceived(payeeUserId, getDisplayName(payer ?? null), amount,
        result.remainingDebt, result.sessionName);
    } catch {
      notificationFailed = true;
      console.error("Split payment notification failed after commit", { operationId });
    }
    return NextResponse.json({ success: true, replayed: false, notificationFailed,
      remainingDebt: result.remainingDebt, recordedAmount: amount, sessionId });
  } catch (error) {
    console.error("Error recording split payment:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "No se pudo confirmar el pago; revisá el saldo antes de reintentar" }, { status: 500 });
  }
}
