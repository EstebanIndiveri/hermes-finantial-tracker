import { NextRequest, NextResponse } from "next/server";
import { getRecurringStats } from "@/lib/db/recurring-queries";
import { getRecurringWebContext } from "@/lib/recurring/web-group-context";

/**
 * GET /api/recurring-expenses/stats
 * Get recurring expense statistics
 */
export async function GET(req: NextRequest) {
  try {
    const context = await getRecurringWebContext(req);
    if (context.error) return context.error;
    const { userId, groupId } = context;

    const stats = await getRecurringStats(userId, groupId);

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error fetching recurring stats:", error);
    return NextResponse.json(
      { error: "Error al obtener estadísticas" },
      { status: 500 }
    );
  }
}
