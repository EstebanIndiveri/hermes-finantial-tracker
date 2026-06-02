import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { group_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getGroupMembership, isOwner } from "@/lib/groups/permissions";
import { z } from "zod";

type Params = { params: Promise<{ id: string; userId: string }> };

const patchSchema = z.object({ role: z.enum(["admin", "member"]) });

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const requesterId = req.headers.get("x-user-id");
  if (!requesterId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId, userId: targetUserId } = await params;

  const requesterMembership = await getGroupMembership(requesterId, groupId);
  if (!requesterMembership || !isOwner(requesterMembership.role)) {
    return NextResponse.json({ error: "Solo el owner puede cambiar roles." }, { status: 403 });
  }
  if (requesterId === targetUserId) {
    return NextResponse.json({ error: "No podés cambiar tu propio rol." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const targetMembership = await getGroupMembership(targetUserId, groupId);
  if (!targetMembership) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (isOwner(targetMembership.role)) {
    return NextResponse.json({ error: "No se puede cambiar el rol del owner." }, { status: 400 });
  }

  await db.update(group_members)
    .set({ role: parsed.data.role })
    .where(and(eq(group_members.group_id, groupId), eq(group_members.user_id, targetUserId)));

  return NextResponse.json({ group_id: groupId, user_id: targetUserId, role: parsed.data.role });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const requesterId = req.headers.get("x-user-id");
  if (!requesterId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: groupId, userId: targetUserId } = await params;

  const requesterMembership = await getGroupMembership(requesterId, groupId);
  if (!requesterMembership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isSelf = requesterId === targetUserId;
  if (!isSelf && !isOwner(requesterMembership.role)) {
    return NextResponse.json({ error: "Solo el owner puede remover miembros." }, { status: 403 });
  }

  const targetMembership = await getGroupMembership(targetUserId, groupId);
  if (!targetMembership) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (isOwner(targetMembership.role)) {
    return NextResponse.json({ error: "El owner no puede salir del grupo. Eliminá el grupo si querés." }, { status: 400 });
  }

  await db.delete(group_members)
    .where(and(eq(group_members.group_id, groupId), eq(group_members.user_id, targetUserId)));

  return new NextResponse(null, { status: 204 });
}
