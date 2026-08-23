import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import {
  getUserRecurringExpenses,
  createRecurringExpense,
  getRecurringStats,
} from "@/lib/db/recurring-queries";
import { db } from "@/lib/db/client";
import { users, groups, group_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

async function getGroupIdForUser(userId: string): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  return user?.active_telegram_group_id ?? null;
}

/**
 * GET /api/recurring-expenses
 * List all recurring expenses for the authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "true";
    const groupId = searchParams.get("groupId") ?? await getGroupIdForUser(userId) ?? undefined;
    const includeStats = searchParams.get("stats") === "true";

    const expenses = await getUserRecurringExpenses(userId, {
      activeOnly,
      groupId,
    });

    if (includeStats) {
      const stats = await getRecurringStats(userId);
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
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CreateRecurringSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const groupId = await getGroupIdForUser(userId);

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
