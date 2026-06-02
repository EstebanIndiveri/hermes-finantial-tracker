import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, group_invitations } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { signSession } from "@/lib/utils/session";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { name, token, invite_token } = body as {
      name?: string;
      token?: string;
      invite_token?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 50) {
      return NextResponse.json({ error: "El nombre debe tener entre 1 y 50 caracteres" }, { status: 400 });
    }
    if (!token || typeof token !== "string" || token.length < 8) {
      return NextResponse.json({ error: "El token debe tener al menos 8 caracteres" }, { status: 400 });
    }
    if (!invite_token) {
      return NextResponse.json({ error: "Token de invitación requerido" }, { status: 400 });
    }

    const invitation = await db.query.group_invitations.findFirst({
      where: and(
        eq(group_invitations.token, invite_token),
        eq(group_invitations.used, 0),
        gt(group_invitations.expires_at, Date.now()),
      ),
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitación inválida o expirada" }, { status: 410 });
    }

    const personal_token_hash = await bcrypt.hash(token, 10);
    const userId = randomUUID();

    await db.insert(users).values({
      id: userId,
      name: name.trim(),
      personal_token_hash,
    });

    const sessionValue = await signSession(userId);
    const res = NextResponse.json({ user_id: userId, group_id: invitation.group_id });
    res.cookies.set("hermes_session", sessionValue, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err) {
    console.error("Error in register:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
