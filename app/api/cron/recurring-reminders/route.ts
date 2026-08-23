import { NextResponse } from "next/server";
import { getUpcomingExecutions, getOverdueExecutions } from "@/lib/db/recurring-queries";

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
          parse_mode: "Markdown",
        }),
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const upcoming = await getUpcomingExecutions(3);
    const overdue = await getOverdueExecutions();

    let notificationsSent = 0;

    for (const userData of upcoming) {
      if (!userData.telegramUserId) continue;

      const lines = ["⏰ *Recordatorio de pagos próximos*\n"];
      for (const exec of userData.executions) {
        const emoji = exec.recurringExpense.category?.emoji || "💰";
        const name = exec.recurringExpense.name;
        const amount =
          exec.amountArs?.toLocaleString("es-AR") ||
          exec.recurringExpense.amountArs.toLocaleString("es-AR");
        const date = exec.scheduledDate;
        lines.push(`${emoji} *${name}*: $${amount} - Vence ${date}`);
      }
      lines.push("\n💡 Usa /recurrentes para ver todos o /pendientes para los del mes");

      const sent = await sendTelegramMessage(userData.telegramUserId, lines.join("\n"));
      if (sent) notificationsSent++;
    }

    for (const userData of overdue) {
      if (!userData.telegramUserId) continue;

      const lines = ["🚨 *Pagos vencidos pendientes*\n"];
      for (const exec of userData.executions) {
        const emoji = exec.recurringExpense.category?.emoji || "💰";
        const name = exec.recurringExpense.name;
        const amount =
          exec.amountArs?.toLocaleString("es-AR") ||
          exec.recurringExpense.amountArs.toLocaleString("es-AR");
        const date = exec.scheduledDate;
        const daysOverdue = Math.floor(
          (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
        );
        lines.push(
          `${emoji} *${name}*: $${amount} - Venció hace ${daysOverdue} día${
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
