import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users, transactions, bot_messages } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { buildDailyAlert } from "@/lib/telegram/alerts";
import { getPersonalGroup } from "@/lib/groups/permissions";

/**
 * Daily cron job for proactive Telegram alerts.
 * Runs at 00:00 UTC = 21:00 ARS every day.
 * Sends alerts when: expenses today, Monday, categories WARNING/CLOSED, semáforo YELLOW/RED.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const month = getActiveMonthArgentina();
    const today = getArgentinaDate();
    const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
    const isForceTest = req.nextUrl.searchParams.get("test") === "1";
    const isMonday = isForceTest || today.getDay() === 1;

    // Get all users (personal app — typically one)
    const allUsers = await db.select().from(users);
    const results: { userId: string; sent: boolean; reason?: string }[] = [];

    for (const user of allUsers) {
      // Resolve chat_id: env var first, then last bot_message from this user
      let chatId = process.env.TELEGRAM_CHAT_ID ?? null;
      if (!chatId) {
        const lastMsg = await db.query.bot_messages.findFirst({
          where: eq(bot_messages.user_id, user.id),
          orderBy: (m, { desc }) => desc(m.created_at),
        });
        chatId = lastMsg?.telegram_chat_id ?? null;
      }

      if (!chatId) {
        results.push({ userId: user.id, sent: false, reason: "no_chat_id" });
        continue;
      }

      // Resolve user's active group (personal group fallback)
      const groupId = user.active_telegram_group_id ?? await getPersonalGroup(user.id);
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

      const [summary, categoryBreakdown] = await Promise.all([
        getMonthSummary(groupId, month),
        getCategoryBreakdown(groupId, month),
      ]);

      if (!summary) {
        results.push({ userId: user.id, sent: false, reason: "no_settings" });
        continue;
      }

      const { shouldSend, message } = buildDailyAlert({
        month,
        income_usd: summary.income_usd,
        total_spent_usd: summary.total_spent_usd,
        ahorro_proyectado_usd: summary.ahorro_proyectado_usd,
        saving_goal_usd: summary.saving_goal_usd,
        status: summary.status,
        exchange_rate: summary.exchange_rate,
        categories: categoryBreakdown.map(c => ({
          name: c.name,
          emoji: c.emoji,
          gastado_ars: c.gastado_ars,
          budget_ars: c.budget_ars,
          status: c.status,
        })),
        todayTransactions: todayTx.map(t => ({
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

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("Error in daily-alerts cron:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
