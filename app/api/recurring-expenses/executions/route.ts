import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import {
  getPendingExecutions,
  getMonthExecutions,
  getRecurringStats,
} from "@/lib/db/recurring-queries";

/**
 * GET /api/recurring-expenses/executions
 * List executions for the current month
 */
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") ?? undefined;
    const pendingOnly = searchParams.get("pending") === "true";
    const includeStats = searchParams.get("stats") === "true";

    const executions = pendingOnly
      ? await getPendingExecutions(userId, month)
      : await getMonthExecutions(userId, month);

    if (includeStats) {
      const stats = await getRecurringStats(userId);
      return NextResponse.json({ executions, stats });
    }

    return NextResponse.json({ executions });
  } catch (error) {
    console.error("Error fetching executions:", error);
    return NextResponse.json(
      { error: "Error al obtener ejecuciones" },
      { status: 500 }
    );
  }
}
