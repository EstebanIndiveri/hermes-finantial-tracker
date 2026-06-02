import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";

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
