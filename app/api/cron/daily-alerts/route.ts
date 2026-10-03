import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, transactions, monthly_settings, split_sessions, splits, reimbursementRequests } from "@/lib/db/schema";
import { eq, and, gte, lte, lt } from "drizzle-orm";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { getMonthSummary, getAccountingMonthProjection, getCategoryBreakdown } from "@/lib/finance/summaries";
import { calculateMonthStatus } from "@/lib/finance/rules";
import { isIncomeCategory } from "@/lib/finance/income";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { buildDailyAlert } from "@/lib/telegram/alerts";
import { resolveAuthorizedTelegramGroup } from "@/lib/telegram/authorized-group-context";
import { notifyReimbursementReminder, getUserById } from "@/lib/notifications/telegram";
import { isCronRequestAuthorized } from "@/lib/auth/cron";
import { getNotificationsRuntimeMode } from "@/lib/runtime/notifications";

/**
 * Daily cron job for proactive Telegram alerts.
 * Runs at 00:00 UTC = 21:00 ARS every day.
 * Sends alerts when: expenses today, Monday, categories WARNING/CLOSED, semáforo YELLOW/RED.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequestAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notificationsMode = getNotificationsRuntimeMode();
  if (notificationsMode === "invalid") {
    return NextResponse.json({ error: "Notifications unavailable" }, { status: 503 });
  }
  if (notificationsMode === "disabled") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "notifications_disabled",
      results: [],
    });
  }

  try {
    const month = getActiveMonthArgentina();
    const today = getArgentinaDate();
    const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
    const isForceTest = req.nextUrl.searchParams.get("test") === "1";
    const isMonday = isForceTest || today.getDay() === 1;

    // Get all users (personal app — typically one)
    const allUsers = await db.select().from(users);
    const results: { userId: string; sent: boolean; reason?: string }[] = [];

    for (const user of allUsers) {
      // A previous message may belong to an unrelated group chat. Proactive
      // financial summaries go only to the user's linked private Telegram ID.
      const chatId = user.telegram_user_id ?? null;

      if (!chatId) {
        results.push({ userId: user.id, sent: false, reason: "no_chat_id" });
        continue;
      }

      // Resolve only a currently authorized group (and clear stale membership pointers).
      const groupId = await resolveAuthorizedTelegramGroup(user.id, user.active_telegram_group_id);
      if (!groupId) {
        results.push({ userId: user.id, sent: false, reason: "no_group" });
        continue;
      }

      // Get today's transactions (created_at between start and end of today ARS)
      const startOfDay = new Date(todayStr + "T00:00:00-03:00").getTime();
      const endOfDay = new Date(todayStr + "T23:59:59-03:00").getTime();

      const todayTx = await db.query.transactions.findMany({
        where: and(
          eq(transactions.group_id, groupId),
          eq(transactions.month, month),
          eq(transactions.status, "active"),
          gte(transactions.created_at, startOfDay),
          lte(transactions.created_at, endOfDay),
        ),
        with: { category: true },
      });

      const settings = await db.query.monthly_settings.findFirst({
        where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
      });
      const mode = settings?.currency_mode;
      if (!settings || (mode !== "USD_ARS" && mode !== "ARS_ARS") ||
        (mode === "ARS_ARS" && process.env.ACT05_ARS_MODE_ENABLED !== "true")) {
        results.push({ userId: user.id, sent: false, reason: "summary_unavailable" });
        continue;
      }

      let financials;
      if (mode === "ARS_ARS") {
        const projection = await getAccountingMonthProjection(groupId, month);
        if (!projection || projection.mode !== "ARS_ARS" ||
          settings.saving_goal_yellow_ars == null || !Number.isFinite(settings.saving_goal_yellow_ars)) {
          results.push({ userId: user.id, sent: false, reason: "summary_unavailable" });
          continue;
        }
        financials = {
          accountingCurrency: "ARS" as const,
          income: projection.effectiveIncome,
          totalSpent: projection.totalExpenses,
          projectedSavings: projection.projectedSavings,
          savingGoal: projection.savingGoal,
          status: calculateMonthStatus({
            income_usd: projection.effectiveIncome,
            total_spent_usd: projection.totalExpenses,
            saving_goal_usd: projection.savingGoal,
            saving_goal_yellow: settings.saving_goal_yellow_ars,
          }),
        };
      } else {
        const summary = await getMonthSummary(groupId, month);
        if (!summary) {
          results.push({ userId: user.id, sent: false, reason: "summary_unavailable" });
          continue;
        }
        financials = {
          accountingCurrency: "USD" as const,
          income: summary.income_usd,
          totalSpent: summary.total_spent_usd,
          projectedSavings: summary.ahorro_proyectado_usd,
          savingGoal: summary.saving_goal_usd,
          status: summary.status,
        };
      }
      const categoryBreakdown = await getCategoryBreakdown(groupId, month);

      const { shouldSend, message } = buildDailyAlert({
        month,
        ...financials,
        categories: categoryBreakdown.filter(c => !c.is_income).map(c => ({
          name: c.name,
          emoji: c.emoji,
          gastado_ars: c.gastado_ars,
          budget_ars: c.budget_ars,
          status: c.status,
        })),
        todayTransactions: todayTx.filter(t => t.category && !isIncomeCategory(t.category.slug)).map(t => ({
          amount_ars: t.amount_ars,
          category: t.category?.name ?? "Sin categoría",
          emoji: t.category?.emoji ?? "📦",
        })),
        isMonday,
      });

      if (shouldSend) {
        await sendTelegramMessage(chatId, message);
        results.push({ userId: user.id, sent: true });
      } else {
        results.push({ userId: user.id, sent: false, reason: "nothing_relevant" });
      }
    }

    // Split session reminders — alert groups with pending debts after 24h inactivity
    const SPLIT_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
    const splitAlertCutoff = Date.now() - SPLIT_ALERT_INTERVAL_MS;

    const openGroupSessions = await db.query.split_sessions.findMany({
      where: and(
        eq(split_sessions.status, "open"),
      ),
    });

    for (const session of openGroupSessions) {
      // Only alert Telegram group sessions
      if (!session.telegram_chat_id) continue;

      // Skip if already alerted recently
      if (session.last_alert_at && session.last_alert_at > splitAlertCutoff) continue;

      // Check if there are any unsettled items in this session
      const unpaidItems = await db.query.splits.findFirst({
        where: and(
          eq(splits.session_id, session.id),
          eq(splits.status, "active")
        ),
      });
      if (!unpaidItems) continue; // No active items, skip alert

      try {
        await sendTelegramMessage(
          session.telegram_chat_id,
          `⏰ <b>Recordatorio — ${session.name}</b>\n\nHay deudas pendientes en este grupo. Usá /balances para ver el estado actual.`
        );
        await db.update(split_sessions)
          .set({ last_alert_at: Date.now() })
          .where(eq(split_sessions.id, session.id));
      } catch (err) {
        console.error("Error sending split session alert:", {
          sessionId: session.id,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Reimbursement reminders — alert payers for reimbursements pending > 3 days
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const reimbursementCutoff = Date.now() - THREE_DAYS_MS;

    const pendingOldReimbursements = await db
      .select({
        id: reimbursementRequests.id,
        payerId: reimbursementRequests.payerId,
        requesterId: reimbursementRequests.requesterId,
        amount: reimbursementRequests.amount,
        createdAt: reimbursementRequests.createdAt,
      })
      .from(reimbursementRequests)
      .where(
        and(
          eq(reimbursementRequests.status, "pending"),
          lt(reimbursementRequests.createdAt, reimbursementCutoff),
        ),
      );

    for (const reimbursement of pendingOldReimbursements) {
      // Only send to assigned payers (not open reimbursements)
      if (!reimbursement.payerId) continue;

      const daysPending = Math.floor((Date.now() - reimbursement.createdAt) / (24 * 60 * 60 * 1000));
      
      try {
        const requester = await getUserById(reimbursement.requesterId);
        const requesterName = requester?.name ?? "Alguien";
        
        await notifyReimbursementReminder(
          reimbursement.payerId,
          requesterName,
          reimbursement.amount,
          daysPending,
        );
      } catch (err) {
        console.error("Error sending reimbursement reminder:", {
          reimbursementId: reimbursement.id,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("Error in daily-alerts cron:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
