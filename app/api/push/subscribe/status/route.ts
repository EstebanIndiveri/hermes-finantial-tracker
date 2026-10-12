import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { getSessionCookieName } from "@/lib/auth/session-cookie";
import { isSubscriptionOwnedByUser } from "@/lib/notifications/web-push";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(getSessionCookieName())?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 4096) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const ownedByCurrentUser = await isSubscriptionOwnedByUser(userId, endpoint);
  return NextResponse.json({ ownedByCurrentUser }, { headers: { "Cache-Control": "no-store" } });
}
