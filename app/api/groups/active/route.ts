import { NextRequest, NextResponse } from "next/server";
import { getGroupMembership } from "@/lib/groups/permissions";
import { z } from "zod";

const schema = z.object({ group_id: z.string().uuid() });

export async function GET(req: NextRequest): Promise<NextResponse> {
  const groupId = req.headers.get("x-group-id");
  const userId = req.headers.get("x-user-id");
  if (!groupId || !userId) return NextResponse.json({ group_id: null, role: null });
  const membership = await getGroupMembership(userId, groupId);
  return NextResponse.json({ group_id: groupId, role: membership?.role ?? null });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid group_id" }, { status: 422 });

  const membership = await getGroupMembership(userId, parsed.data.group_id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("active_group_id", parsed.data.group_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
