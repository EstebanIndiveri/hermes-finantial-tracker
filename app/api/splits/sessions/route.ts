// app/api/splits/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { split_sessions, split_session_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  telegram_chat_id: z.string().optional(),
});

/** Returns all sessions where the user is owner or member */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sessions = await db.query.split_sessions.findMany({
      where: eq(split_sessions.owner_user_id, userId),
      orderBy: (t, { desc }) => desc(t.created_at),
    });

    return NextResponse.json(sessions);
  } catch (err) {
    console.error("Error fetching split sessions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Creates a new split session */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const id = randomUUID();
    const now = Date.now();
    const session = {
      id,
      name: parsed.data.name,
      owner_user_id: userId,
      telegram_chat_id: parsed.data.telegram_chat_id ?? null,
      status: "open" as const,
      created_at: now,
    };

    await db.insert(split_sessions).values(session);

    // Owner is automatically a member
    await db.insert(split_session_members).values({
      session_id: id,
      user_id: userId,
      temp_user_id: null,
      joined_at: now,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    console.error("Error creating split session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
