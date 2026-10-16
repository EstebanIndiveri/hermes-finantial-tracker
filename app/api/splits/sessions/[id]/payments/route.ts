import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordManualSplitPayment } from "@/lib/splits/record-payment";
import { enqueueWebSplitPaymentNotice, webSplitOutboxBotId } from "@/lib/splits/web-payment-notification";

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

    const botId = webSplitOutboxBotId();
    const payeeUserId = input.payeeUserId;
    let notificationQueued = false;
    const paymentInput = {
      operationId: input.operationId,
      sessionId,
      actorId,
      payeeUserId,
      payeeTempId: input.payeeTempId,
      amount: input.amount,
    };
    const result = await recordManualSplitPayment(paymentInput, botId && payeeUserId
      ? { onRecorded: async (tx, payment, remainingDebt, sessionName) => {
          notificationQueued = await enqueueWebSplitPaymentNotice(tx, {
            botId, operationId: input.operationId, paymentId: payment.id,
            payerUserId: actorId, payeeUserId,
            amount: input.amount, remainingDebt, sessionName,
          });
        } }
      : undefined);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ...result.payment, notificationQueued: result.replayed ? null : notificationQueued },
      { status: result.replayed ? 200 : 201 });
  } catch (error) {
    console.error("Error recording split payment:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
