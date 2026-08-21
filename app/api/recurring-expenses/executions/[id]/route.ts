import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { confirmExecution, skipExecution } from "@/lib/db/recurring-queries";
import { z } from "zod";

const ConfirmSchema = z.object({
  amount: z.number().positive().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/recurring-expenses/executions/[id]?action=confirm
 * Confirm an execution (create transaction)
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

    if (action === "confirm") {
      const body = await req.json().catch(() => ({}));
      const parsed = ConfirmSchema.safeParse(body);
      const amount = parsed.success ? parsed.data.amount : undefined;

      const result = await confirmExecution(id, amount);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        transactionId: result.transactionId,
      });
    }

    if (action === "skip") {
      const result = await skipExecution(id);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Acción no válida. Usa ?action=confirm o ?action=skip" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error processing execution:", error);
    return NextResponse.json(
      { error: "Error al procesar ejecución" },
      { status: 500 }
    );
  }
}
