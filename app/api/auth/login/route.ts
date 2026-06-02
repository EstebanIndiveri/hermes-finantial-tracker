import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";

// In-memory rate limiter: max 10 login attempts per IP per 5 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 5 * 60 * 1000;

function checkRateLimit(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfter: 0 };
}

async function createSessionResponse(userId: string): Promise<NextResponse> {
  const sessionValue = await signSession(userId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("hermes_session", sessionValue, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const { limited, retryAfter } = checkRateLimit(ip);
  if (limited) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body?.token || typeof body.token !== "string") {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    const { token } = body;

    const allUsers = await db.query.users.findMany();

    // Phase 1: check per-user bcrypt hashes
    for (const user of allUsers) {
      if (user.personal_token_hash) {
        const match = await bcrypt.compare(token, user.personal_token_hash);
        if (match) return createSessionResponse(user.id);
      }
    }

    // Phase 2: legacy fallback for owner without personal_token_hash
    const legacyUser = allUsers.find(u => !u.personal_token_hash);
    if (legacyUser) {
      const envToken = process.env.WEB_ACCESS_TOKEN ?? "";
      if (!envToken) {
        console.error("Login: owner has no personal_token_hash and WEB_ACCESS_TOKEN is not set");
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
      const providedBuf = Buffer.from(token);
      const expectedBuf = Buffer.from(envToken);
      if (
        providedBuf.length === expectedBuf.length &&
        timingSafeEqual(providedBuf, expectedBuf)
      ) {
        return createSessionResponse(legacyUser.id);
      }
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (err) {
    console.error("Error in login:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
