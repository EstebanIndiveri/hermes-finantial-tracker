import { NextRequest, NextResponse } from "next/server";
import { getRecurringWebContext } from "@/lib/recurring/web-group-context";
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
    const context = await getRecurringWebContext(req);
    if (context.error) return context.error;
    const { userId, groupId } = context;

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") ?? undefined;
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
    }
    const pendingOnly = searchParams.get("pending") === "true";
    const includeStats = searchParams.get("stats") === "true";

    const executions = pendingOnly
      ? await getPendingExecutions(userId, month, groupId)
      : await getMonthExecutions(userId, month, groupId);

    if (includeStats) {
      const stats = await getRecurringStats(userId, groupId, month);
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
