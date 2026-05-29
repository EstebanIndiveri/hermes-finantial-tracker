import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { budgets } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { randomUUID } from "crypto";

const monthRegex = /^\d{4}-\d{2}$/;

const schema = z.object({
  month: z.string().regex(monthRegex).optional(),
  items: z.array(z.object({
    category_id: z.string().uuid(),
    budget_ars: z.number().min(0),
    hard_limit: z.boolean().optional().default(true),
  })).min(1),
});

/**
 * Returns budgets for the active month
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const month = getActiveMonthArgentina();
    const rows = await db.select().from(budgets).where(
      and(eq(budgets.user_id, userId), eq(budgets.month, month))
    );

    return NextResponse.json(rows.map(r => ({
      category_id: r.category_id,
      budget_ars: r.budget_ars,
      hard_limit: r.hard_limit === 1,
    })));
  } catch (err) {
    console.error("Error fetching budgets:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Batch updates or creates budgets for multiple categories
 * @param req - NextRequest with x-user-id header and JSON body { items: Array<{category_id, budget_ars, hard_limit?}>, month? }
 * @returns JSON response with { ok: true } or error
 */
export async function PATCH(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const month = parsed.data.month ?? getActiveMonthArgentina();

    for (const item of parsed.data.items) {
      await db.insert(budgets).values({
        id: randomUUID(),
        user_id: userId,
        month,
        category_id: item.category_id,
        budget_ars: item.budget_ars,
        hard_limit: item.hard_limit ? 1 : 0,
      }).onConflictDoUpdate({
        target: [budgets.user_id, budgets.month, budgets.category_id],
        set: {
          budget_ars: item.budget_ars,
          hard_limit: item.hard_limit ? 1 : 0,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error updating budgets:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
