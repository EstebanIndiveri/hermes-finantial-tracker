import { NextRequest, NextResponse } from "next/server";
import { getRecurringStats } from "@/lib/db/recurring-queries";
import { verifySession } from "@/lib/auth/session";

/**
 * GET /api/recurring-expenses/stats
 * Get recurring expense statistics
 */
export async function GET(req: NextRequest) {
  try {
    const cookie = req.cookies.get("hermes_session")?.value;
    const userId = cookie ? await verifySession(cookie) : null;
    
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const stats = await getRecurringStats(userId);

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error fetching recurring stats:", error);
    return NextResponse.json(
      { error: "Error al obtener estadísticas" },
      { status: 500 }
    );
  }
}
