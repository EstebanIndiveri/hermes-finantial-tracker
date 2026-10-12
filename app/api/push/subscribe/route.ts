import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { getSessionCookieName } from "@/lib/auth/session-cookie";
import { removeSubscription, saveSubscription } from "@/lib/notifications/web-push";

function getSessionCookie(req: NextRequest): string | null {
  return req.cookies.get(getSessionCookieName())?.value ?? null;
}

async function getAuthenticatedUser(req: NextRequest): Promise<string | null> {
  const cookie = getSessionCookie(req);
  return cookie ? verifySession(cookie) : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUser(req);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This endpoint intentionally exposes only the public half of the VAPID pair.
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "Push notifications are not configured" }, { status: 503 });
  }

  return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUser(req);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const subscription = body?.subscription;

  if (
    typeof subscription?.endpoint !== "string" ||
    typeof subscription?.keys?.p256dh !== "string" ||
    typeof subscription?.keys?.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await saveSubscription(userId, subscription);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUser(req);

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";

  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
  }

  await removeSubscription(userId, endpoint);
  return NextResponse.json({ success: true });
}
