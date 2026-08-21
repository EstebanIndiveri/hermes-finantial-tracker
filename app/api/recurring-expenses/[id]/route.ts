import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import {
  getRecurringExpenseById,
  updateRecurringExpense,
  deleteRecurringExpense,
  toggleRecurringExpense,
} from "@/lib/db/recurring-queries";
import { z } from "zod";

const UpdateRecurringSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  amountArs: z.number().positive().optional(),
  categoryId: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  frequency: z.enum(["monthly", "weekly", "yearly"]).optional(),
  dayOfMonth: z.number().min(1).max(28).optional(),
  isActive: z.boolean().optional(),
  autoConfirm: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/recurring-expenses/[id]
 * Get a single recurring expense
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const expense = await getRecurringExpenseById(id);

    if (!expense) {
      return NextResponse.json(
        { error: "Gasto recurrente no encontrado" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (expense.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    return NextResponse.json({ expense });
  } catch (error) {
    console.error("Error fetching recurring expense:", error);
    return NextResponse.json(
      { error: "Error al obtener gasto recurrente" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/recurring-expenses/[id]
 * Update a recurring expense
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await getRecurringExpenseById(id);

    if (!existing) {
      return NextResponse.json(
        { error: "Gasto recurrente no encontrado" },
        { status: 404 }
      );
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = UpdateRecurringSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateRecurringExpense(id, parsed.data);

    return NextResponse.json({ expense: updated });
  } catch (error) {
    console.error("Error updating recurring expense:", error);
    return NextResponse.json(
      { error: "Error al actualizar gasto recurrente" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/recurring-expenses/[id]
 * Delete a recurring expense
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await getRecurringExpenseById(id);

    if (!existing) {
      return NextResponse.json(
        { error: "Gasto recurrente no encontrado" },
        { status: 404 }
      );
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await deleteRecurringExpense(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting recurring expense:", error);
    return NextResponse.json(
      { error: "Error al eliminar gasto recurrente" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recurring-expenses/[id] (with action=toggle)
 * Toggle active status
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action !== "toggle") {
      return NextResponse.json(
        { error: "Acción no válida. Usa ?action=toggle" },
        { status: 400 }
      );
    }

    const existing = await getRecurringExpenseById(id);

    if (!existing) {
      return NextResponse.json(
        { error: "Gasto recurrente no encontrado" },
        { status: 404 }
      );
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const toggled = await toggleRecurringExpense(id);

    return NextResponse.json({ expense: toggled });
  } catch (error) {
    console.error("Error toggling recurring expense:", error);
    return NextResponse.json(
      { error: "Error al cambiar estado del gasto recurrente" },
      { status: 500 }
    );
  }
}
