import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { timingSafeEqual } from "crypto";

/**
 * Login endpoint - validates access token and creates session
 * @param req - NextRequest with JSON body { token: string }
 * @returns JSON response with { ok: true } and sets hermes_session cookie
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const providedToken = Buffer.from(body.token);
    const expectedToken = Buffer.from(process.env.WEB_ACCESS_TOKEN ?? "");
    
    if (providedToken.length !== expectedToken.length || !timingSafeEqual(providedToken, expectedToken)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst();

    if (!user) return NextResponse.json({ error: "No user found. Run seed first." }, { status: 500 });

    const sessionValue = await signSession(user.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set("hermes_session", sessionValue, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    console.error("Error in login:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
