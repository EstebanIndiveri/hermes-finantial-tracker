import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const { current_token, new_token } = (body ?? {}) as { current_token?: string; new_token?: string };

    if (!current_token || !new_token) {
      return NextResponse.json({ error: "current_token y new_token son requeridos" }, { status: 400 });
    }
    if (new_token.length < 8) {
      return NextResponse.json({ error: "El nuevo token debe tener al menos 8 caracteres" }, { status: 400 });
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Verify current token
    if (user.personal_token_hash) {
      const match = await bcrypt.compare(current_token, user.personal_token_hash);
      if (!match) return NextResponse.json({ error: "Token actual incorrecto" }, { status: 401 });
    } else {
      // Legacy fallback
      const envToken = process.env.WEB_ACCESS_TOKEN ?? "";
      if (!envToken) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      const providedBuf = Buffer.from(current_token);
      const expectedBuf = Buffer.from(envToken);
      if (
        providedBuf.length !== expectedBuf.length ||
        !timingSafeEqual(providedBuf, expectedBuf)
      ) {
        return NextResponse.json({ error: "Token actual incorrecto" }, { status: 401 });
      }
    }

    const new_hash = await bcrypt.hash(new_token, 10);
    await db.update(users).set({ personal_token_hash: new_hash }).where(eq(users.id, userId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error in PATCH /api/auth/me/token:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
