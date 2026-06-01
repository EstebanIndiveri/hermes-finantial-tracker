import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";

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

    const all = req.nextUrl.searchParams.get("all") === "true";

    const cats = await db.query.categories.findMany({
      where: all ? undefined : eq(categories.is_active, 1),
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

    const body = await req.json().catch(() => null);
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const { name, emoji, sort_order, default_hard_limit } = parsed.data;
    const slug = toSlug(name);
    if (!slug || /^_+$/.test(slug)) {
      return NextResponse.json({ error: "El nombre de la categoría no es válido." }, { status: 422 });
    }

    const existing = await db.query.categories.findFirst({
      where: eq(categories.slug, slug),
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
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("Error creating category:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
