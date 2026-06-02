import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

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
    if (!body?.username || typeof body.username !== "string") {
      return NextResponse.json({ error: "Missing username" }, { status: 400 });
    }
    if (!body?.password || typeof body.password !== "string") {
      return NextResponse.json({ error: "Missing password" }, { status: 400 });
    }

    const { username, password } = body as { username: string; password: string };

    const user = await db
      .select()
      .from(users)
      .where(eq(users.username, username.toLowerCase()))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!user || !user.personal_token_hash) {
      return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
    }

    const match = await bcrypt.compare(password, user.personal_token_hash);
    if (!match) {
      return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
    }

    return createSessionResponse(user.id);
  } catch (err) {
    console.error("Error in login:", err);
    const errObj = err instanceof Error
      ? { message: err.message, cause: String((err as NodeJS.ErrnoException).cause ?? ""), stack: err.stack?.split("\n")[0] }
      : { raw: String(err) };
    return NextResponse.json({ error: "Internal server error", detail: errObj }, { status: 500 });
  }
}
