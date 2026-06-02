import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getGroupMembership } from "@/lib/groups/permissions";

const postSchema = z.object({
  name: z.string().min(1).max(40),
  emoji: z.string().min(1).max(8),
  sort_order: z.number().int().min(1).max(99),
  default_hard_limit: z.boolean().optional().default(true),
});

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 50);
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const groupId = req.headers.get("x-group-id");
    if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

    const membership = await getGroupMembership(userId, groupId);
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const all = req.nextUrl.searchParams.get("all") === "true";

    const cats = await db.query.categories.findMany({
      where: all
        ? eq(categories.group_id, groupId)
        : and(eq(categories.is_active, 1), eq(categories.group_id, groupId)),
      orderBy: (c, { asc }) => asc(c.sort_order),
    });

    return NextResponse.json(cats);
  } catch (err) {
    console.error("Error fetching categories:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const groupId = req.headers.get("x-group-id");
    if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

    const membership = await getGroupMembership(userId, groupId);
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const { name, emoji, sort_order, default_hard_limit } = parsed.data;
    const slug = toSlug(name);
    if (!slug || /^_+$/.test(slug)) {
      return NextResponse.json({ error: "El nombre de la categoría no es válido." }, { status: 422 });
    }

    const existing = await db.query.categories.findFirst({
      where: and(eq(categories.slug, slug), eq(categories.group_id, groupId)),
    });
    if (existing) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre." }, { status: 409 });
    }

    const [created] = await db
      .insert(categories)
      .values({
        id: randomUUID(),
        slug,
        name,
        emoji,
        sort_order,
        default_hard_limit: default_hard_limit ? 1 : 0,
        is_active: 1,
        group_id: groupId,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint failed: categories.slug")) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre." }, { status: 409 });
    }
    console.error("Error creating category:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
