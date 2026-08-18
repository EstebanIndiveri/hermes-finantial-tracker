import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { transactions, budgets, monthly_settings, categories } from "@/lib/db/schema";
import { eq, and, sum } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { calculateCategoryStatus } from "@/lib/finance/rules";
import { getGroupMembership } from "@/lib/groups/permissions";
import { createReimbursementWithNotifications } from "@/lib/reimbursements/requests";

const createSchema = z.object({
  category_id: z.string().uuid(),
  amount_ars: z.number().positive().max(100_000_000),
  merchant: z.string().max(100).optional(),
  description: z.string().max(300).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_exception: z.boolean().optional().default(false),
  requiresReimbursement: z.boolean().optional().default(false),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groupId = req.headers.get("x-group-id");
  if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

  const membership = await getGroupMembership(userId, groupId);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const month = req.nextUrl.searchParams.get("month") ?? getActiveMonthArgentina();

  try {
    const rows = await db.query.transactions.findMany({
      where: and(
        eq(transactions.group_id, groupId),
        eq(transactions.month, month),
        eq(transactions.status, "active"),
      ),
      orderBy: (t, { desc }) => desc(t.created_at),
      with: { category: true },
    });

    return NextResponse.json(rows);
  } catch (err) {
    console.error("Error fetching transactions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groupId = req.headers.get("x-group-id");
  if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 400 });

  const membership = await getGroupMembership(userId, groupId);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const payerId = typeof body?.payerId === "string" ? body.payerId : undefined;

  const {
    category_id,
    amount_ars,
    merchant,
    description,
    is_exception,
    requiresReimbursement,
    month: monthParam,
  } = parsed.data;
  const currentMonth = getActiveMonthArgentina();
  const month = monthParam && monthParam <= currentMonth ? monthParam : currentMonth;

  try {
    const category = await db.query.categories.findFirst({
      where: and(eq(categories.id, category_id), eq(categories.group_id, groupId)),
    });
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    const settings = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
    });
    if (!settings) return NextResponse.json({ error: "No hay configuración para el mes activo." }, { status: 400 });

    if (settings.exchange_rate <= 0) {
      return NextResponse.json({ error: "Invalid exchange rate configuration" }, { status: 500 });
    }

    const budget = await db.query.budgets.findFirst({
      where: and(eq(budgets.group_id, groupId), eq(budgets.month, month), eq(budgets.category_id, category_id)),
    });

    if (budget && budget.budget_ars > 0) {
      // NOTE: There is a known race condition here (TOCTOU). If two concurrent requests
      // arrive for the same category with a hard limit, both could pass the check and
      // both insert, exceeding the limit. A proper fix would require database transactions
      // with row-level locking or optimistic locking with a version field.
      // This is accepted technical debt for MVP.
      const spentRows = await db
        .select({ total: sum(transactions.amount_ars) })
        .from(transactions)
        .where(and(
          eq(transactions.group_id, groupId),
          eq(transactions.month, month),
          eq(transactions.category_id, category_id),
          eq(transactions.status, "active")
        ));
      const gastado = Number(spentRows[0]?.total ?? 0);
      const status = calculateCategoryStatus({ gastado_ars: gastado, budget_ars: budget.budget_ars });

      if (status === "CLOSED") {
        if (budget.hard_limit) {
          return NextResponse.json({
            error: "CATEGORY_CLOSED",
            code: "CATEGORY_CLOSED",
            message: "Esta categoría superó su presupuesto y tiene límite duro. No se puede agregar el gasto."
          }, { status: 400 });
        }
        if (!is_exception) {
          return NextResponse.json({
            error: "BUDGET_EXCEEDED_SOFT",
            code: "BUDGET_EXCEEDED_SOFT",
            message: "La categoría está cerrada. Podés confirmar la excepción enviando is_exception: true."
          }, { status: 422 });
        }
      }

      // Hard limits are NEVER bypassable, even with is_exception=true
      if (gastado + amount_ars > budget.budget_ars && budget.hard_limit) {
        return NextResponse.json({
          error: "BUDGET_EXCEEDED_HARD",
          code: "BUDGET_EXCEEDED_HARD",
          message: "Este gasto excede el presupuesto y la categoría tiene límite duro."
        }, { status: 400 });
      }
    }

    const amount_usd = parseFloat((amount_ars / settings.exchange_rate).toFixed(2));
    const today = getArgentinaDate();
    const date = parsed.data.date ?? today.toISOString().slice(0, 10);

    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(transactions).values({
        id,
        user_id: userId,
        group_id: groupId,
        category_id,
        amount_ars,
        amount_usd,
        merchant: merchant ?? null,
        description: description ?? null,
        date,
        month,
        source: "web",
        status: "active",
        is_exception: is_exception ? 1 : 0,
        requiresReimbursement,
      });

      if (requiresReimbursement) {
        await createReimbursementWithNotifications(id, userId, amount_ars, payerId);
      }
    });

    return NextResponse.json({ id, amount_ars, amount_usd, month }, { status: 201 });
  } catch (err) {
    console.error("Error creating transaction:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
