import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { removeSubscription, saveSubscription } from "@/lib/notifications/web-push";

function getSessionCookie(req: NextRequest): string | null {
  return req.cookies.get("hermes_session")?.value ?? null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = getSessionCookie(req);
  const session = cookie ? await verifySession(cookie) : null;

  if (!session?.userId) {
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

  await saveSubscription(session.userId, subscription);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const cookie = getSessionCookie(req);
  const session = cookie ? await verifySession(cookie) : null;

  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";

  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
  }

  await removeSubscription(endpoint);
  return NextResponse.json({ success: true });
}
