import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { monthly_settings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchRipioRate, RipioFetchError } from "@/lib/exchange/ripio";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { randomUUID } from "crypto";

/**
 * Cron job endpoint to update exchange rate from Ripio API
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
    const user = await db.query.users.findFirst();
    if (!user) return NextResponse.json({ error: "No user" }, { status: 500 });

    let rate: number;
    try {
      rate = await fetchRipioRate();
    } catch (err) {
      const message = err instanceof RipioFetchError ? err.message : "Unknown error";
      const existing = await db.query.monthly_settings.findFirst({
        where: and(eq(monthly_settings.user_id, user.id), eq(monthly_settings.month, month)),
      });
      return NextResponse.json({ error: "RIPIO_UNAVAILABLE", message, lastRate: existing?.exchange_rate ?? null, lastUpdated: existing?.exchange_rate_updated_at ?? null });
    }

    const existing = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.user_id, user.id), eq(monthly_settings.month, month)),
    });

    if (existing) {
      await db.update(monthly_settings)
        .set({ exchange_rate: rate, exchange_rate_source: "ripio", exchange_rate_updated_at: Date.now() })
        .where(and(eq(monthly_settings.user_id, user.id), eq(monthly_settings.month, month)));
    } else {
      await db.insert(monthly_settings).values({
        id: randomUUID(), user_id: user.id, month,
        income_usd: 0, exchange_rate: rate, exchange_rate_source: "ripio",
        exchange_rate_updated_at: Date.now(), saving_goal_usd: 0, saving_goal_yellow: 0,
      });
    }

    return NextResponse.json({ ok: true, rate, month });
  } catch (err) {
    console.error("Error in exchange rate cron job:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
