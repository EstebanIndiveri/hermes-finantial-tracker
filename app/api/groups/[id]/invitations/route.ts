import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_invitations } from "@/lib/db/schema";
import { getGroupMembership, canManageMembers } from "@/lib/groups/permissions";
import { randomUUID } from "crypto";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  role: z.enum(["admin", "member"]),
  expires_days: z.number().int().min(1).max(30).optional().default(7),
});

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId } = await params;

  const membership = await getGroupMembership(userId, groupId);
  if (!membership || !canManageMembers(membership.role)) {
    return NextResponse.json({ error: "Solo owner o admin pueden invitar miembros." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { role, expires_days } = parsed.data;
  const token = randomUUID();
  const expires_at = Date.now() + expires_days * 24 * 60 * 60 * 1000;

  const [invitation] = await db.insert(group_invitations).values({
    id: randomUUID(),
    group_id: groupId,
    token,
    role,
    created_by: userId,
    expires_at,
  }).returning();

  return NextResponse.json(invitation, { status: 201 });
}
