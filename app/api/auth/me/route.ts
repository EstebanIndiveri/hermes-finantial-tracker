import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/utils/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    has_personal_token: !!user.personal_token_hash,
    has_telegram: !!user.telegram_user_id,
    onboarding_completed: !!user.onboarding_completed_at,
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get("hermes_session")?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || body.onboarding_completed !== true) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.update(users)
    .set({ onboarding_completed_at: Date.now() })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
