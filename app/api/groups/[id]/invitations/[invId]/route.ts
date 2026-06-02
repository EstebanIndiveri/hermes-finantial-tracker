import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_invitations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getGroupMembership, canManageMembers } from "@/lib/groups/permissions";

type Params = { params: Promise<{ id: string; invId: string }> };

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId, invId } = await params;

  const membership = await getGroupMembership(userId, groupId);
  if (!membership || !canManageMembers(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invitation = await db.query.group_invitations.findFirst({
    where: and(eq(group_invitations.id, invId), eq(group_invitations.group_id, groupId)),
  });
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  await db.delete(group_invitations).where(eq(group_invitations.id, invId));
  return new NextResponse(null, { status: 204 });
}
