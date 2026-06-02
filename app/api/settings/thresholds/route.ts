import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { monthly_settings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { getGroupMembership } from "@/lib/groups/permissions";

const monthRegex = /^\d{4}-\d{2}$/;

const schema = z.object({
  saving_goal_usd: z.number().min(0),
  saving_goal_yellow: z.number().min(0),
  month: z.string().regex(monthRegex).optional(),
});

/**
 * Updates saving goal thresholds for the active group (owner/admin only)
 * @param req - NextRequest with x-user-id and x-group-id headers and JSON body { saving_goal_usd, saving_goal_yellow, month? }
 * @returns JSON response with { ok: true } or error
 */
export async function PATCH(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    const groupId = req.headers.get("x-group-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 401 });

    const membership = await getGroupMembership(userId, groupId);
    if (!membership || membership.role === "member") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const month = parsed.data.month ?? getActiveMonthArgentina();
    
    const existing = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
    });

    if (!existing) {
      return NextResponse.json({ error: "Settings not found for this month" }, { status: 404 });
    }

    await db.update(monthly_settings)
      .set({ saving_goal_usd: parsed.data.saving_goal_usd, saving_goal_yellow: parsed.data.saving_goal_yellow })
      .where(and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error updating thresholds:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
