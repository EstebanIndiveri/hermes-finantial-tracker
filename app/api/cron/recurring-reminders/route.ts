import { NextResponse } from "next/server";
import { getUpcomingExecutions, getOverdueExecutions, type RecurringExecutionWithDetails } from "@/lib/db/recurring-queries";
import { isCronRequestAuthorized } from "@/lib/auth/cron";
import { getNotificationsRuntimeMode } from "@/lib/runtime/notifications";
import { escapeTelegramHtml } from "@/lib/telegram/html";
import { hasProactiveConsent } from "@/lib/notifications/proactive-consent";
import { buildRecurringReminderSnapshotHash, enqueueRecurringReminder } from "@/lib/notifications/recurring-reminder-delivery";
import { getRecurringReminderScope, isRecurringReminderRecipientAllowed } from "@/lib/notifications/recurring-reminder-canary";
import { getArgentinaDateKey } from "@/lib/utils/dates";
import { materializeCanaryUpcomingExecutions } from "@/lib/notifications/recurring-canary-materialization";

function upcomingDateKey(today: string): string {
  const date = new Date(`${today}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString().slice(0, 10);
}

function reminderSnapshotHash(executions: RecurringExecutionWithDetails[]): string {
  return buildRecurringReminderSnapshotHash(executions.map((execution) => ({
    id: execution.id,
    scheduledDate: execution.scheduledDate,
    amountArs: execution.amountArs,
    recurringName: execution.recurringExpense.name,
    recurringAmount: execution.recurringExpense.amountArs,
    categoryEmoji: execution.recurringExpense.category?.emoji ?? null,
  })));
}

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notificationsMode = getNotificationsRuntimeMode();
  if (notificationsMode === "invalid") {
    return NextResponse.json({ error: "Notifications unavailable" }, { status: 503 });
  }
  const scope = getRecurringReminderScope();
  if (scope.mode === "off") {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "notifications_disabled",
      upcoming: 0,
      overdue: 0,
      notificationsQueued: 0,
    });
  }

  try {
    if (scope.mode === "canary" && await hasProactiveConsent(scope.userId, "recurring")) {
      await materializeCanaryUpcomingExecutions(scope.userId, scope.groupId, upcomingDateKey(getArgentinaDateKey()));
    }
    const upcoming = await getUpcomingExecutions(3);
    const overdue = await getOverdueExecutions();

    let notificationsQueued = 0;
    const argentinaDate = getArgentinaDateKey();

    for (const userData of upcoming) {
      if (!userData.telegramUserId || !userData.groupId || userData.executions.length === 0) continue;
      if (!isRecurringReminderRecipientAllowed(userData.userId, userData.groupId)) continue;
      if (!await hasProactiveConsent(userData.userId, "recurring")) continue;

      const lines = ["⏰ <b>Recordatorio de pagos próximos</b>\n"];
      for (const exec of userData.executions) {
        const emoji = escapeTelegramHtml(exec.recurringExpense.category?.emoji || "💰");
        const name = escapeTelegramHtml(exec.recurringExpense.name);
        const amount =
          exec.amountArs?.toLocaleString("es-AR") ||
          exec.recurringExpense.amountArs.toLocaleString("es-AR");
        const date = exec.scheduledDate;
        lines.push(`${emoji} <b>${name}</b>: $${amount} - Vence ${date}`);
      }
      lines.push("\n💡 Usa /recurrentes para ver todos o /pendientes para los del mes");

      const queued = await enqueueRecurringReminder({
        userId: userData.userId,
        chatId: userData.telegramUserId,
        context: {
          groupId: userData.groupId,
          argentinaDate,
          reminderKind: "upcoming",
          executionIds: userData.executions.map((execution) => execution.id),
          snapshotHash: reminderSnapshotHash(userData.executions),
        },
        message: lines.join("\n"),
      });
      if (queued) notificationsQueued++;
    }

    for (const userData of overdue) {
      if (!userData.telegramUserId || !userData.groupId || userData.executions.length === 0) continue;
      if (!isRecurringReminderRecipientAllowed(userData.userId, userData.groupId)) continue;
      if (!await hasProactiveConsent(userData.userId, "recurring")) continue;

      const lines = ["🚨 <b>Pagos vencidos pendientes</b>\n"];
      for (const exec of userData.executions) {
        const emoji = escapeTelegramHtml(exec.recurringExpense.category?.emoji || "💰");
        const name = escapeTelegramHtml(exec.recurringExpense.name);
        const amount =
          exec.amountArs?.toLocaleString("es-AR") ||
          exec.recurringExpense.amountArs.toLocaleString("es-AR");
        const date = exec.scheduledDate;
        const daysOverdue = Math.floor(
          (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
        );
        lines.push(
          `${emoji} <b>${name}</b>: $${amount} - Venció hace ${daysOverdue} día${
            daysOverdue === 1 ? "" : "s"
          }`
        );
      }
      lines.push("\n💡 Responde /pagar para marcarlos como pagados");

      const queued = await enqueueRecurringReminder({
        userId: userData.userId,
        chatId: userData.telegramUserId,
        context: {
          groupId: userData.groupId,
          argentinaDate,
          reminderKind: "overdue",
          executionIds: userData.executions.map((execution) => execution.id),
          snapshotHash: reminderSnapshotHash(userData.executions),
        },
        message: lines.join("\n"),
      });
      if (queued) notificationsQueued++;
    }

    return NextResponse.json({
      success: true,
      upcoming: upcoming.length,
      overdue: overdue.length,
      notificationsQueued,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
