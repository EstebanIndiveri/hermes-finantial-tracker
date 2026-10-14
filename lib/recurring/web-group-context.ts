import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { getSessionCookieName } from "@/lib/auth/session-cookie";
import { getGroupMembership } from "@/lib/groups/permissions";

/** The middleware replaces x-group-id after validating the selected web group. */
export async function getRecurringWebContext(req: NextRequest): Promise<
  | { userId: string; groupId: string; error?: never }
  | { userId?: never; groupId?: never; error: NextResponse }
> {
  const cookie = req.cookies.get(getSessionCookieName())?.value;
  const userId = cookie ? await verifySession(cookie) : null;
  if (!userId) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };

  const groupId = req.headers.get("x-group-id");
  if (!groupId) return { error: NextResponse.json({ error: "No hay grupo activo" }, { status: 400 }) };
  const membership = await getGroupMembership(userId, groupId);
  if (!membership) return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  return { userId, groupId };
}
