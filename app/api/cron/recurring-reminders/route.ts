import { NextResponse } from "next/server";
import { getUpcomingExecutions, getOverdueExecutions } from "@/lib/db/recurring-queries";
import { isCronRequestAuthorized } from "@/lib/auth/cron";
import { getNotificationsRuntimeMode } from "@/lib/runtime/notifications";
import { escapeTelegramHtml } from "@/lib/telegram/html";
import { hasProactiveConsent } from "@/lib/notifications/proactive-consent";

async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notificationsMode = getNotificationsRuntimeMode();
  if (notificationsMode === "invalid") {
    return NextResponse.json({ error: "Notifications unavailable" }, { status: 503 });
  }
  if (notificationsMode === "disabled") {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "notifications_disabled",
      upcoming: 0,
      overdue: 0,
      notificationsSent: 0,
    });
  }

  try {
    const upcoming = await getUpcomingExecutions(3);
    const overdue = await getOverdueExecutions();

    let notificationsSent = 0;

    for (const userData of upcoming) {
      if (!userData.telegramUserId) continue;
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

      const sent = await sendTelegramMessage(userData.telegramUserId, lines.join("\n"));
      if (sent) notificationsSent++;
    }

    for (const userData of overdue) {
      if (!userData.telegramUserId) continue;
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

      const sent = await sendTelegramMessage(userData.telegramUserId, lines.join("\n"));
      if (sent) notificationsSent++;
    }

    return NextResponse.json({
      success: true,
      upcoming: upcoming.length,
      overdue: overdue.length,
      notificationsSent,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
