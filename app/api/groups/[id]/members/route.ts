import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getGroupMembership } from "@/lib/groups/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const membership = await getGroupMembership(userId, id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await db.query.group_members.findMany({
    where: eq(group_members.group_id, id),
    with: { user: true },
  });

  return NextResponse.json(members);
}
