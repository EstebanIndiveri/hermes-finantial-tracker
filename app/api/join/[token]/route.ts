import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_invitations, group_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { token } = await params;

  const invitation = await db.query.group_invitations.findFirst({
    where: eq(group_invitations.token, token),
    with: { group: true, creator: true },
  });

  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invitation.expires_at < Date.now()) return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
  if (invitation.used_at) return NextResponse.json({ error: "Invitation already used" }, { status: 409 });

  return NextResponse.json({
    group: invitation.group,
    invited_by: invitation.creator,
    role: invitation.role,
    expires_at: invitation.expires_at,
  });
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { token } = await params;

  const invitation = await db.query.group_invitations.findFirst({
    where: eq(group_invitations.token, token),
  });

  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invitation.expires_at < Date.now()) return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
  if (invitation.used_at) return NextResponse.json({ error: "Invitation already used" }, { status: 409 });

  const existing = await db.query.group_members.findFirst({
    where: and(eq(group_members.group_id, invitation.group_id), eq(group_members.user_id, userId)),
  });
  if (existing) return NextResponse.json({ error: "Ya sos miembro de este grupo." }, { status: 409 });

  await db.insert(group_members).values({
    group_id: invitation.group_id,
    user_id: userId,
    role: invitation.role,
  });

  await db.update(group_invitations)
    .set({ used_at: Date.now(), used_by: userId })
    .where(eq(group_invitations.id, invitation.id));

  return NextResponse.json({ group_id: invitation.group_id, role: invitation.role });
}
