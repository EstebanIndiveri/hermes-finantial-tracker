// app/api/splits/sessions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, splits, split_session_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  status: z.literal("closed"),
  closing_note: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, id),
    });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [sessionSplits, members] = await Promise.all([
      db.query.splits.findMany({ where: eq(splits.session_id, id) }),
      db.query.split_session_members.findMany({ where: eq(split_session_members.session_id, id) }),
    ]);

    return NextResponse.json({ session, splits: sessionSplits, members });
  } catch (err) {
    console.error("Error fetching session detail:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await db.query.split_sessions.findFirst({
      where: eq(split_sessions.id, id),
    });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.owner_user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    await db.update(split_sessions)
      .set({ status: "closed", closed_at: Date.now(), closing_note: parsed.data.closing_note ?? null })
      .where(eq(split_sessions.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error updating session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
