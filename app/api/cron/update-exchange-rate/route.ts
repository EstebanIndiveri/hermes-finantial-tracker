import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { monthly_settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchRipioRate, RipioFetchError } from "@/lib/exchange/ripio";
import { getActiveMonthArgentina } from "@/lib/utils/dates";

/**
 * Cron job endpoint to update exchange rate from Ripio API.
 * Updates ALL groups' monthly_settings for the current month.
 * @param req - NextRequest with Authorization: Bearer <CRON_SECRET> header
 * @returns JSON response with rate and month, or error details
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const month = getActiveMonthArgentina();

    let rate: number;
    try {
      rate = await fetchRipioRate();
    } catch (err) {
      const message = err instanceof RipioFetchError ? err.message : "Unknown error";
      return NextResponse.json(
        { error: "RIPIO_UNAVAILABLE", message },
        { status: 503 }
      );
    }

    const existing = await db.select({ id: monthly_settings.id }).from(monthly_settings).where(eq(monthly_settings.month, month));

    if (existing.length > 0) {
      await db.update(monthly_settings)
        .set({ exchange_rate: rate, exchange_rate_source: "ripio", exchange_rate_updated_at: Date.now() })
        .where(eq(monthly_settings.month, month));
    }

    return NextResponse.json({ ok: true, rate, month, updated: existing.length });
  } catch (err) {
    console.error("Error in exchange rate cron job:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
