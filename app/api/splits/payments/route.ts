import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { verifySession } from "@/lib/auth/session";
import { getSessionCookieName } from "@/lib/auth/session-cookie";
import { db } from "@/lib/db/client";
import { telegram_delivery_outbox, telegram_operations, users } from "@/lib/db/schema";
import { buildSplitPaymentReceivedNotification, notifySplitPaymentReceived } from "@/lib/notifications/telegram";
import { recordManualSplitPayment } from "@/lib/splits/record-payment";
import { createTelegramDeliveryKey, createTelegramOperationContext, createTelegramOperationIdentity } from "@/lib/telegram/operation-context";
import { buildTelegramDeliveryRow } from "@/lib/telegram/outbox";
import { resolveTelegramBotId } from "@/lib/telegram/update-inbox";

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

function webSplitOutboxBotId(): string | null {
  if (process.env.TELEGRAM_INBOX_ENABLED !== "true" ||
    process.env.TELEGRAM_OUTBOX_ENABLED !== "true" ||
    process.env.TELEGRAM_OUTBOX_WORKER_ENABLED !== "true" ||
    !process.env.TELEGRAM_BOT_TOKEN?.trim()) return null;
  try {
    return resolveTelegramBotId();
  } catch {
    return null;
  }
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
    const outboxBotId = webSplitOutboxBotId();
    let notificationQueued = false;
    const paymentInput = { operationId, sessionId, actorId: userId, payeeUserId, amount };
    const result = outboxBotId
      ? await recordManualSplitPayment(paymentInput, {
          onRecorded: async (tx, payment, remainingDebt, sessionName) => {
            const [payee] = await tx.select({ chatId: users.telegram_user_id })
              .from(users).where(eq(users.id, payeeUserId)).limit(1);
            if (!payee?.chatId) return;
            const [payer] = await tx.select({ username: users.username, name: users.name })
              .from(users).where(eq(users.id, userId)).limit(1);
            const updateId = `web-split:${operationId}`;
            const context = createTelegramOperationContext({
              botId: outboxBotId, updateId, chatId: payee.chatId,
              action: "web.split.payment", suffix: operationId,
            });
            const identity = createTelegramOperationIdentity(context);
            const now = Date.now();
            await tx.insert(telegram_operations).values({
              operation_id: identity.operationId,
              bot_id: outboxBotId,
              update_id: updateId,
              operation_kind: "web.split.payment",
              status: "committed",
              resource_type: "split_payment",
              resource_id: payment.id,
              result_json: JSON.stringify({ payeeUserId }),
              created_at: now,
              updated_at: now,
              committed_at: now,
            });
            await tx.insert(telegram_delivery_outbox).values(buildTelegramDeliveryRow({
              botId: outboxBotId,
              updateId,
              operationId: identity.operationId,
              deliveryKey: createTelegramDeliveryKey(identity, "split_payment_received", payee.chatId),
              action: "send_message",
              chatId: payee.chatId,
              text: buildSplitPaymentReceivedNotification(
                getDisplayName(payer ?? null), amount, remainingDebt, sessionName,
              ).text,
              now,
            }));
            notificationQueued = true;
          },
        })
      : await recordManualSplitPayment(paymentInput);
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
      return NextResponse.json({ success: true, replayed: true, notificationFailed: null, notificationQueued: null,
        remainingDebt: null, recordedAmount: amount, sessionId });
    }

    if (outboxBotId) {
      return NextResponse.json({ success: true, replayed: false, notificationFailed: null,
        notificationQueued, remainingDebt: result.remainingDebt, recordedAmount: amount, sessionId });
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
