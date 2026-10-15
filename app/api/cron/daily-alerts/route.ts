import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, transactions, monthly_settings, reimbursementRequests } from "@/lib/db/schema";
import { eq, and, gte, lt } from "drizzle-orm";
import { getArgentinaDateKey, getArgentinaDayBounds } from "@/lib/utils/dates";
import { getMonthSummary, getAccountingMonthProjection, getCategoryBreakdown } from "@/lib/finance/summaries";
import { calculateMonthStatus } from "@/lib/finance/rules";
import { isIncomeCategory } from "@/lib/finance/income";
import { buildDailyAlert } from "@/lib/telegram/alerts";
import { enqueueDailySummary } from "@/lib/notifications/daily-summary-delivery";
import { resolveAuthorizedTelegramGroup } from "@/lib/telegram/authorized-group-context";
import { notifyReimbursementReminder, getUserById } from "@/lib/notifications/telegram";
import { isCronRequestAuthorized } from "@/lib/auth/cron";
import { getNotificationsRuntimeMode } from "@/lib/runtime/notifications";
import { getGroupMembership } from "@/lib/groups/permissions";
import { hasProactiveConsent } from "@/lib/notifications/proactive-consent";
import { getDailySummaryScope, isDailySummaryRecipientAllowed } from "@/lib/notifications/daily-summary-canary";
import { getReimbursementReminderScope } from "@/lib/notifications/reimbursement-reminder-canary";

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
  // The beta canary is a separate one-user/one-group exception. Missing or
  // malformed configuration never inherits the legacy default-on behavior.
  const scope = getDailySummaryScope();
  const reimbursementScope = getReimbursementReminderScope();
  if (scope.mode === "off") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "notifications_disabled",
      results: [],
    });
  }

  if (req.nextUrl.searchParams.has("test")) {
    return NextResponse.json({ error: "dry-run not supported" }, { status: 400 });
  }

  try {
    const todayStr = getArgentinaDateKey();
    const month = todayStr.slice(0, 7);
    const isMonday = new Date(`${todayStr}T12:00:00Z`).getUTCDay() === 1;

    // Get all users (personal app — typically one)
    const allUsers = await db.select().from(users);
    const results: { userId: string; sent: boolean; reason?: string }[] = [];

    for (const user of allUsers) {
      if (scope.mode === "canary" && user.id !== scope.userId) {
        results.push({ userId: user.id, sent: false, reason: "outside_canary" });
        continue;
      }
      // A previous message may belong to an unrelated group chat. Proactive
      // financial summaries go only to the user's linked private Telegram ID.
      const chatId = user.telegram_user_id ?? null;

      if (!chatId) {
        results.push({ userId: user.id, sent: false, reason: "no_chat_id" });
        continue;
      }

      if (!await hasProactiveConsent(user.id, "dailySummary")) {
        results.push({ userId: user.id, sent: false, reason: "not_opted_in" });
        continue;
      }

      // Resolve only a currently authorized group (and clear stale membership pointers).
      const groupId = await resolveAuthorizedTelegramGroup(user.id, user.active_telegram_group_id);
      if (!groupId) {
        results.push({ userId: user.id, sent: false, reason: "no_group" });
        continue;
      }
      if (!isDailySummaryRecipientAllowed(user.id, groupId)) {
        results.push({ userId: user.id, sent: false, reason: "outside_canary" });
        continue;
      }

      // Half-open Argentina day includes every millisecond before local midnight.
      const { startMs, endExclusiveMs } = getArgentinaDayBounds(todayStr);

      const todayTx = await db.query.transactions.findMany({
        where: and(
          eq(transactions.group_id, groupId),
          eq(transactions.month, month),
          eq(transactions.status, "active"),
          gte(transactions.created_at, startMs),
          lt(transactions.created_at, endExclusiveMs),
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
        const queued = await enqueueDailySummary({
          userId: user.id,
          groupId,
          chatId,
          argentinaDate: todayStr,
          message,
        });
        results.push({ userId: user.id, sent: false, reason: queued ? "queued" : "already_queued" });
      } else {
        results.push({ userId: user.id, sent: false, reason: "nothing_relevant" });
      }
    }

    // Stored Telegram chat IDs are not bound to a verified current finance
    // group and recipient set. Session reminders remain disabled until that
    // binding and explicit group-chat consent exist.

    // Reimbursement reminders — alert payers for reimbursements pending > 3 days
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const reimbursementCutoff = Date.now() - THREE_DAYS_MS;

    // The canary is intentionally not wired to this direct-send path. It may
    // only be activated after a durable outbox and dispatcher revalidation exist.
    const pendingOldReimbursements = reimbursementScope.mode === "global" ? await db
      .select({
        id: reimbursementRequests.id,
        transactionId: reimbursementRequests.transactionId,
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
      ) : [];

    for (const reimbursement of pendingOldReimbursements) {
      // Only send to assigned payers (not open reimbursements)
      if (!reimbursement.payerId) continue;
      if (!await hasProactiveConsent(reimbursement.payerId, "reimbursements")) continue;

      // A pending request may outlive group membership. Never disclose its
      // details to a removed payer or for a deleted/cancelled source expense.
      const [source] = await db.select({
        groupId: transactions.group_id,
        status: transactions.status,
        deletedAt: transactions.deleted_at,
      }).from(transactions).where(eq(transactions.id, reimbursement.transactionId)).limit(1);
      if (!source?.groupId || source.status !== "active" || source.deletedAt !== null) continue;
      const [payerMembership, requesterMembership] = await Promise.all([
        getGroupMembership(reimbursement.payerId, source.groupId),
        getGroupMembership(reimbursement.requesterId, source.groupId),
      ]);
      if (!payerMembership || !requesterMembership) continue;

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

    if (scope.mode === "canary") {
      const outcome = results.find((result) => result.userId === scope.userId)?.reason ?? "user_absent";
      // Operational receipt for the scheduled beta canary. Never log IDs,
      // balances, category names, chat IDs or the rendered Telegram message.
      console.info(JSON.stringify({ event: "beta_daily_summary_canary_cron", argentinaDate: todayStr, outcome }));
    }
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("Error in daily-alerts cron:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
