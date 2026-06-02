import { NextRequest, NextResponse } from "next/server";
import { db, foreignKeysReady } from "@/lib/db/client";
import { budgets, categories, transactions } from "@/lib/db/schema";
import { count, eq, and } from "drizzle-orm";
import { z } from "zod";
import { getGroupMembership } from "@/lib/groups/permissions";

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

    const groupId = req.headers.get("x-group-id");
    if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

    const membership = await getGroupMembership(userId, groupId);
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const existing = await db.query.categories.findFirst({
      where: and(eq(categories.id, id), eq(categories.group_id, groupId)),
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
      .where(and(eq(categories.id, id), eq(categories.group_id, groupId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Error updating category:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    await foreignKeysReady;

    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const groupId = req.headers.get("x-group-id");
    if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

    const membership = await getGroupMembership(userId, groupId);
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;

    const existing = await db.query.categories.findFirst({
      where: and(eq(categories.id, id), eq(categories.group_id, groupId)),
    });
    if (!existing) return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });

    const [{ value: txCount }] = await db
      .select({ value: count() })
      .from(transactions)
      .where(and(eq(transactions.category_id, id), eq(transactions.group_id, groupId)));

    if (txCount > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: tiene ${txCount} movimientos.`, count: txCount },
        { status: 409 },
      );
    }

    const [{ value: budgetCount }] = await db
      .select({ value: count() })
      .from(budgets)
      .where(and(eq(budgets.category_id, id), eq(budgets.group_id, groupId)));

    if (budgetCount > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: tiene ${budgetCount} presupuestos.`, count: budgetCount },
        { status: 409 },
      );
    }

    const result = await db.delete(categories).where(and(eq(categories.id, id), eq(categories.group_id, groupId))).returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Categoría no encontrada." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("FOREIGN KEY constraint") || msg.includes("SQLITE_CONSTRAINT")) {
      return NextResponse.json(
        { error: "No se puede eliminar: tiene movimientos o presupuestos asociados." },
        { status: 409 }
      );
    }
    console.error("Error deleting category:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
