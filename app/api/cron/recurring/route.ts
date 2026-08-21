import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createMonthlyExecutions, getPendingExecutions } from "@/lib/db/recurring-queries";
import { sendTelegramMessage, buildPersonalKeyboard } from "@/lib/telegram/send-message";

/**
 * GET /api/cron/recurring
 * Monthly cron job to create recurring expense executions
 * 
 * Called by Vercel Cron on the 1st of each month at 8:00 AM
 * Also supports manual triggering with ?userId=xxx for testing
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { searchParams } = new URL(req.url);
    const testUserId = searchParams.get("userId");
    
    // Allow testing with specific user
    if (testUserId) {
      const created = await createMonthlyExecutions(testUserId);
      const pending = await getPendingExecutions(testUserId);
      
      return NextResponse.json({
        success: true,
        created,
        pendingCount: pending.length,
        testMode: true,
      });
    }

    // Production: verify cron secret
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all users
    const allUsers = await db.select({ id: users.id, telegramUserId: users.telegram_user_id }).from(users);
    
    let totalCreated = 0;
    let notificationsSent = 0;

    for (const user of allUsers) {
      try {
        const created = await createMonthlyExecutions(user.id);
        totalCreated += created;

        if (created > 0 && user.telegramUserId) {
          const pending = await getPendingExecutions(user.id);
          
          if (pending.length > 0) {
            const totalAmount = pending.reduce(
              (sum, e) => sum + (e.amountArs ?? e.recurringExpense.amountArs),
              0
            );

            const message = formatPendingNotification(pending, totalAmount);
            const keyboard = buildPersonalKeyboard([
              [
                { text: "✅ Ver Pendientes", callback_data: "recurring:pending" },
                { text: "📋 Mis Recurrentes", callback_data: "recurring:list" },
              ],
            ]);
            
            await sendTelegramMessage(user.telegramUserId, message, keyboard);
            notificationsSent++;
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${user.id}:`, userError);
      }
    }

    return NextResponse.json({
      success: true,
      usersProcessed: allUsers.length,
      executionsCreated: totalCreated,
      notificationsSent,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json(
      { error: "Error en cron de gastos recurrentes" },
      { status: 500 }
    );
  }
}

interface PendingExecution {
  recurringExpense: {
    name: string;
    amountArs: number;
    category: { emoji: string } | null;
  };
  amountArs: number | null;
}

function formatPendingNotification(
  pending: PendingExecution[],
  totalAmount: number
): string {
  const lines = [
    "📅 <b>Inicio de mes - Gastos Recurrentes</b>\n",
    `Tienes ${pending.length} gasto${pending.length > 1 ? "s" : ""} recurrente${pending.length > 1 ? "s" : ""} pendiente${pending.length > 1 ? "s" : ""}:\n`,
  ];

  pending.forEach((exec, i) => {
    const emoji = exec.recurringExpense.category?.emoji ?? "📦";
    const amount = exec.amountArs ?? exec.recurringExpense.amountArs;
    lines.push(`${i + 1}. ${emoji} ${exec.recurringExpense.name} - $${amount.toLocaleString("es-AR")}`);
  });

  lines.push(`\n<b>Total proyectado: $${totalAmount.toLocaleString("es-AR")}</b>`);

  return lines.join("\n");
}
