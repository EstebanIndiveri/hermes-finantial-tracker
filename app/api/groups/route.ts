import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { groups, group_members } from "@/lib/db/schema";
import { getUserGroups, countOwnedGroups, MAX_OWNED_GROUPS } from "@/lib/groups/permissions";
import { randomUUID } from "crypto";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(50),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userGroups = await getUserGroups(userId);
    return NextResponse.json(userGroups);
  } catch (err) {
    console.error("Error fetching groups:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const owned = await countOwnedGroups(userId);
    if (owned >= MAX_OWNED_GROUPS) {
      return NextResponse.json(
        { error: `Podés crear hasta ${MAX_OWNED_GROUPS} grupos.`, code: "MAX_GROUPS_REACHED" },
        { status: 422 }
      );
    }

    const groupId = randomUUID();
    const [created] = await db.insert(groups).values({
      id: groupId,
      name: parsed.data.name,
      owner_id: userId,
    }).returning();

    await db.insert(group_members).values({
      group_id: groupId,
      user_id: userId,
      role: "owner",
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("Error creating group:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
