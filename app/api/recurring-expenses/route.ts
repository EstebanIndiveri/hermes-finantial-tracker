import { NextRequest, NextResponse } from "next/server";
import { getRecurringWebContext } from "@/lib/recurring/web-group-context";
import {
  getUserRecurringExpenses,
  createRecurringExpense,
  getRecurringStats,
} from "@/lib/db/recurring-queries";
import { z } from "zod";

const CreateRecurringSchema = z.object({
  name: z.string().min(1).max(100),
  amountArs: z.number().positive(),
  categoryId: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  frequency: z.enum(["monthly", "weekly", "yearly"]).default("monthly"),
  dayOfMonth: z.number().min(1).max(31).default(1),
  autoConfirm: z.boolean().default(false),
  notes: z.string().nullable().optional(),
});

/**
 * GET /api/recurring-expenses
 * List all recurring expenses for the authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    const context = await getRecurringWebContext(req);
    if (context.error) return context.error;
    const { userId, groupId } = context;

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";
    const includeStats = searchParams.get("stats") === "true";
    const month = searchParams.get("month");
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
    }

    const expenses = await getUserRecurringExpenses(userId, {
      activeOnly,
      groupId,
    });

    if (includeStats) {
      const stats = await getRecurringStats(userId, groupId, month ?? undefined);
      return NextResponse.json({ expenses, stats });
    }

    return NextResponse.json({ expenses });
  } catch (error) {
    console.error("Error fetching recurring expenses:", error);
    return NextResponse.json(
      { error: "Error al obtener gastos recurrentes" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recurring-expenses
 * Create a new recurring expense
 */
export async function POST(req: NextRequest) {
  try {
    const context = await getRecurringWebContext(req);
    if (context.error) return context.error;
    const { userId, groupId } = context;

    const body = await req.json();
    const parsed = CreateRecurringSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const expense = await createRecurringExpense({
      userId,
      groupId,
      ...parsed.data,
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    console.error("Error creating recurring expense:", error);
    return NextResponse.json(
      { error: "Error al crear gasto recurrente" },
      { status: 500 }
    );
  }
}
