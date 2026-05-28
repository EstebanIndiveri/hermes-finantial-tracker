import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { monthly_settings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { randomUUID } from "crypto";

const monthRegex = /^\d{4}-\d{2}$/;

const schema = z.object({
  income_usd: z.number().positive().optional(),
  exchange_rate: z.number().positive().optional(),
  saving_goal_usd: z.number().min(0).optional(),
  saving_goal_yellow: z.number().min(0).optional(),
  month: z.string().regex(monthRegex).optional(),
});

/**
 * Retrieves monthly settings for a user
 * @param req - NextRequest with x-user-id header and optional month query parameter
 * @returns JSON response with settings or null
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const monthParam = req.nextUrl.searchParams.get("month");
    if (monthParam && !monthRegex.test(monthParam)) {
      return NextResponse.json({ error: "Invalid month format, expected YYYY-MM" }, { status: 400 });
    }

    const month = monthParam ?? getActiveMonthArgentina();
    const settings = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
    });
    return NextResponse.json(settings ?? null);
  } catch (err) {
    console.error("Error fetching monthly settings:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Creates or updates monthly settings for a user
 * @param req - NextRequest with x-user-id header and JSON body
 * @returns JSON response with updated settings or error
 */
export async function PATCH(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const month = parsed.data.month ?? getActiveMonthArgentina();
    const existing = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
    });

    if (existing) {
      await db.update(monthly_settings).set({ ...parsed.data, month: undefined }).where(and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)));
    } else {
      await db.insert(monthly_settings).values({ id: randomUUID(), user_id: userId, month, income_usd: 0, exchange_rate: 1, saving_goal_usd: 0, saving_goal_yellow: 0, ...parsed.data });
    }

    const updated = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("Error updating monthly settings:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
