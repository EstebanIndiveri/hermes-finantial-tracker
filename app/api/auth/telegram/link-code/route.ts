import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import { telegram_link_codes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 6-digit random code (zero-padded)
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    const expires_at = Date.now() + 24 * 60 * 60 * 1000; // 24h

    // Replace any existing code for this user
    await db.delete(telegram_link_codes).where(eq(telegram_link_codes.user_id, userId));
    await db.insert(telegram_link_codes).values({ id: code, user_id: userId, expires_at });

    return NextResponse.json({ code, expires_at });
  } catch (err) {
    console.error("Error in POST /api/auth/telegram/link-code:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
