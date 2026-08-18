import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { groups, group_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getGroupMembership, isOwner, isAdminOrAbove } from "@/lib/groups/permissions";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  partnerId: z.string().nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const membership = await getGroupMembership(userId, id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const group = await db.query.groups.findFirst({ where: eq(groups.id, id) });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...group, role: membership.role });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const membership = await getGroupMembership(userId, id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const updates: { name?: string; partner_id?: string | null } = {};

  // Name change requires owner
  if (parsed.data.name !== undefined) {
    if (!isOwner(membership.role)) {
      return NextResponse.json({ error: "Solo el owner puede renombrar el grupo." }, { status: 403 });
    }
    updates.name = parsed.data.name;
  }

  // Partner change requires admin or above
  if (parsed.data.partnerId !== undefined) {
    if (!isAdminOrAbove(membership.role)) {
      return NextResponse.json({ error: "Solo admins pueden configurar el partner." }, { status: 403 });
    }
    // Validate partner is a group member
    if (parsed.data.partnerId !== null) {
      const isMember = await db.query.group_members.findFirst({
        where: and(
          eq(group_members.group_id, id),
          eq(group_members.user_id, parsed.data.partnerId),
        ),
      });
      if (!isMember) {
        return NextResponse.json({ error: "El partner debe ser miembro del grupo." }, { status: 422 });
      }
    }
    updates.partner_id = parsed.data.partnerId;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 422 });
  }

  const [updated] = await db.update(groups)
    .set(updates)
    .where(eq(groups.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const membership = await getGroupMembership(userId, id);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isOwner(membership.role)) return NextResponse.json({ error: "Solo el owner puede eliminar el grupo." }, { status: 403 });

  await db.delete(groups).where(eq(groups.id, id));
  return new NextResponse(null, { status: 204 });
}
