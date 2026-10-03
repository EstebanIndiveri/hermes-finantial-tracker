import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { monthly_settings, transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getActiveMonthArgentina } from "@/lib/utils/dates";
import { randomUUID } from "crypto";
import { getGroupMembership } from "@/lib/groups/permissions";

const monthRegex = /^\d{4}-\d{2}$/;
const schema = z.object({
  currency_mode: z.enum(["USD_ARS", "ARS_ARS"]).optional(),
  income_usd: z.number().positive().nullable().optional(),
  income_ars: z.number().positive().nullable().optional(),
  exchange_rate: z.number().positive().nullable().optional(),
  saving_goal_usd: z.number().min(0).nullable().optional(),
  saving_goal_ars: z.number().min(0).nullable().optional(),
  saving_goal_yellow: z.number().min(0).nullable().optional(),
  saving_goal_yellow_ars: z.number().min(0).nullable().optional(),
  month: z.string().regex(monthRegex).optional(),
});

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    const groupId = req.headers.get("x-group-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 401 });

    const monthParam = req.nextUrl.searchParams.get("month");
    if (monthParam && !monthRegex.test(monthParam)) {
      return NextResponse.json({ error: "Invalid month format, expected YYYY-MM" }, { status: 400 });
    }
    const month = monthParam ?? getActiveMonthArgentina();
    const settings = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
    });
    const movement = await db.query.transactions.findFirst({
      where: and(eq(transactions.group_id, groupId), eq(transactions.month, month)),
      columns: { id: true },
    });
    // Legacy rows predate currency_mode and are interpreted as USD_ARS.
    return NextResponse.json(settings ? { ...settings, currency_mode: settings.currency_mode ?? "USD_ARS" } : null, {
      headers: {
        "X-ARS-Mode-Enabled": String(process.env.ACT05_ARS_MODE_ENABLED === "true"),
        "X-Currency-Mode-Locked": String(Boolean(movement)),
      },
    });
  } catch (err) {
    console.error("Error fetching monthly settings:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    const groupId = req.headers.get("x-group-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!groupId) return NextResponse.json({ error: "No active group" }, { status: 401 });

    const membership = await getGroupMembership(userId, groupId);
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

    const { month: requestedMonth, ...patch } = parsed.data;
    const month = requestedMonth ?? getActiveMonthArgentina();
    const requestedMode = patch.currency_mode;
    const hasUsdFields = ["income_usd", "saving_goal_usd", "saving_goal_yellow", "exchange_rate"]
      .some((field) => hasOwn(patch, field));
    const hasArsFields = ["income_ars", "saving_goal_ars", "saving_goal_yellow_ars"]
      .some((field) => hasOwn(patch, field));
    if ((requestedMode === "ARS_ARS" && hasUsdFields) || (requestedMode === "USD_ARS" && hasArsFields)) {
      return NextResponse.json({ error: "Settings fields do not match currency_mode" }, { status: 422 });
    }
    if (requestedMode === "ARS_ARS" && process.env.ACT05_ARS_MODE_ENABLED !== "true") {
      return NextResponse.json({ error: "ARS_ARS mode is not enabled" }, { status: 409 });
    }

    const writeResult = await db.transaction(async (tx) => {
      const whereMonth = and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month));
      const existing = await tx.query.monthly_settings.findFirst({ where: whereMonth });
      const currentMode = existing?.currency_mode ?? "USD_ARS";
      const nextMode = requestedMode ?? currentMode;
      const modeChanges = existing ? nextMode !== currentMode : nextMode !== "USD_ARS";
      if ((nextMode === "ARS_ARS" && hasUsdFields) || (nextMode === "USD_ARS" && hasArsFields)) {
        return { error: "Settings fields do not match currency_mode", invalid: true as const };
      }

      if (nextMode === "ARS_ARS" && (modeChanges || !existing) && patch.income_ars == null) {
        return { error: "income_ars is required for ARS_ARS mode", invalid: true as const };
      }
      if (nextMode === "USD_ARS" && (modeChanges || !existing) && patch.income_usd == null) {
        return { error: "income_usd is required for USD_ARS mode", invalid: true as const };
      }
      if (nextMode === "USD_ARS" && (modeChanges || !existing || existing.exchange_rate == null) && patch.exchange_rate == null) {
        return { error: "A positive exchange_rate is required for USD_ARS mode", invalid: true as const };
      }

      if (modeChanges) {
        const movement = await tx.query.transactions.findFirst({
          where: and(eq(transactions.group_id, groupId), eq(transactions.month, month)),
          columns: { id: true },
        });
        if (movement) return { error: "Currency mode cannot change after transactions exist", conflict: true as const };
      }

      if (nextMode === "ARS_ARS") {
        const values = {
          ...patch,
          currency_mode: nextMode,
          income_ars: patch.income_ars ?? existing?.income_ars ?? 0,
          saving_goal_ars: patch.saving_goal_ars ?? existing?.saving_goal_ars ?? 0,
          saving_goal_yellow_ars: patch.saving_goal_yellow_ars ?? existing?.saving_goal_yellow_ars ?? 0,
          income_usd: null,
          saving_goal_usd: null,
          saving_goal_yellow: null,
          exchange_rate: null,
          exchange_rate_source: "manual",
          exchange_rate_updated_at: null,
        };
        if (existing) await tx.update(monthly_settings).set(values).where(whereMonth);
        else await tx.insert(monthly_settings).values({ id: randomUUID(), user_id: userId, group_id: groupId, month, ...values });
      } else {
        const values = {
          ...patch,
          currency_mode: nextMode,
          income_usd: patch.income_usd ?? existing?.income_usd ?? 0,
          saving_goal_usd: patch.saving_goal_usd ?? existing?.saving_goal_usd ?? 0,
          saving_goal_yellow: patch.saving_goal_yellow ?? existing?.saving_goal_yellow ?? 0,
          income_ars: null, saving_goal_ars: null, saving_goal_yellow_ars: null,
        };
        if (existing) await tx.update(monthly_settings).set(values).where(whereMonth);
        else await tx.insert(monthly_settings).values({ id: randomUUID(), user_id: userId, group_id: groupId, month, ...values });
      }
      return { conflict: false as const };
    }, { behavior: "immediate" });

    if ("error" in writeResult) {
      return NextResponse.json({ error: writeResult.error }, { status: writeResult.conflict ? 409 : 422 });
    }
    const updated = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
    });
    return NextResponse.json(updated ? { ...updated, currency_mode: updated.currency_mode ?? "USD_ARS" } : null);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("monthly currency mode is locked by existing movements")) {
      return NextResponse.json({ error: "Currency mode cannot change after transactions exist" }, { status: 409 });
    }
    if (message.includes("monthly settings currency mode and amounts are inconsistent")) {
      return NextResponse.json({ error: "Settings fields do not match currency_mode" }, { status: 422 });
    }
    console.error("Error updating monthly settings:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
