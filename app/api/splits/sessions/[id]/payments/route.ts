// app/api/splits/sessions/[id]/payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, split_payments, split_session_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const createSchema = z.object({
  payerUserId: z.string().optional(),
  payerTempId: z.string().optional(),
  payeeUserId: z.string().optional(),
  payeeTempId: z.string().optional(),
  amount: z.number().positive(),
  method: z.enum(["manual", "receipt_ocr"]).default("manual"),
  receiptImageUrl: z.string().url().optional(),
  ocrRawText: z.string().optional(),
}).refine(p => !!(p.payerUserId || p.payerTempId), {
  message: "Either payerUserId or payerTempId must be provided",
}).refine(p => !!(p.payeeUserId || p.payeeTempId), {
  message: "Either payeeUserId or payeeTempId must be provided",
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

    // Verify requesting user is a member of this session
    const isMember = await db.query.split_session_members.findFirst({
      where: and(
        eq(split_session_members.session_id, sessionId),
        eq(split_session_members.user_id, userId)
      ),
    });
    if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (session.status !== "open") {
      return NextResponse.json({ error: "Session is closed" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const d = parsed.data;
    const payment = {
      id: randomUUID(), session_id: sessionId,
      payer_user_id: d.payerUserId ?? null, payer_temp_id: d.payerTempId ?? null,
      payee_user_id: d.payeeUserId ?? null, payee_temp_id: d.payeeTempId ?? null,
      amount: d.amount, method: d.method,
      receipt_image_url: d.receiptImageUrl ?? null, ocr_raw_text: d.ocrRawText ?? null,
      confirmed_at: d.method === "manual" ? Date.now() : null,
    };

    await db.insert(split_payments).values(payment);
    return NextResponse.json(payment, { status: 201 });
  } catch (err) {
    console.error("Error recording split payment:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
