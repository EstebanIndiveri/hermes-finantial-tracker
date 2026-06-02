import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, group_invitations } from "@/lib/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { signSession } from "@/lib/utils/session";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { name, username, password, invite_token } = body as {
      name?: string;
      username?: string;
      password?: string;
      invite_token?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 50) {
      return NextResponse.json({ error: "El nombre debe tener entre 1 y 50 caracteres" }, { status: 400 });
    }
    if (!username || typeof username !== "string" || username.length < 3 || username.length > 30) {
      return NextResponse.json({ error: "El usuario debe tener entre 3 y 30 caracteres" }, { status: 400 });
    }
    if (!USERNAME_REGEX.test(username)) {
      return NextResponse.json({ error: "El usuario solo puede contener letras, números, - y _" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    if (!invite_token) {
      return NextResponse.json({ error: "Token de invitación requerido" }, { status: 400 });
    }

    const invitation = await db.query.group_invitations.findFirst({
      where: and(
        eq(group_invitations.token, invite_token),
        isNull(group_invitations.used_at),
        gt(group_invitations.expires_at, Date.now()),
      ),
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitación inválida o expirada" }, { status: 410 });
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.username, username.toLowerCase()),
    });
    if (existing) {
      return NextResponse.json({ error: "Ese nombre de usuario ya está en uso" }, { status: 409 });
    }

    const personal_token_hash = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    await db.insert(users).values({
      id: userId,
      name: name.trim(),
      username: username.toLowerCase(),
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
