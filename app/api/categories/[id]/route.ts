import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { budgets, categories, transactions } from "@/lib/db/schema";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  emoji: z.string().min(1).max(8).optional(),
  sort_order: z.number().int().min(1).max(99).optional(),
  default_hard_limit: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const existing = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });
    if (!existing) return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const { name, emoji, sort_order, default_hard_limit, is_active } = parsed.data;

    const updateData: Partial<typeof categories.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (emoji !== undefined) updateData.emoji = emoji;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (default_hard_limit !== undefined) updateData.default_hard_limit = default_hard_limit ? 1 : 0;
    if (is_active !== undefined) updateData.is_active = is_active ? 1 : 0;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 422 });
    }

    const [updated] = await db
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Error updating category:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const existing = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });
    if (!existing) return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });

    const [{ value: txCount }] = await db
      .select({ value: count() })
      .from(transactions)
      .where(and(eq(transactions.category_id, id), eq(transactions.status, "active")));

    if (txCount > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: tiene ${txCount} movimientos.`, count: txCount },
        { status: 409 },
      );
    }

    const [{ value: budgetCount }] = await db
      .select({ value: count() })
      .from(budgets)
      .where(eq(budgets.category_id, id));

    if (budgetCount > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: tiene ${budgetCount} presupuestos.`, count: budgetCount },
        { status: 409 },
      );
    }

    await db.delete(categories).where(eq(categories.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error deleting category:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
