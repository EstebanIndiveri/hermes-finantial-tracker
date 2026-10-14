import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { group_members, recurringExecutions, recurringExpenses, users } from "@/lib/db/schema";
import { getRecurringReminderScope } from "@/lib/notifications/recurring-reminder-canary";
import { getArgentinaDayBounds } from "@/lib/utils/dates";

/** Prepare only a pending QA reminder occurrence; never create a transaction. */
export async function materializeCanaryUpcomingExecutions(
  userId: string,
  groupId: string,
  dueDate: string,
): Promise<number> {
  const scope = getRecurringReminderScope();
  if (scope.mode !== "canary" || scope.userId !== userId || scope.groupId !== groupId) return 0;
  getArgentinaDayBounds(dueDate);
  const day = Number(dueDate.slice(-2));

  const definitions = await db.select({
    id: recurringExpenses.id,
    amountArs: recurringExpenses.amountArs,
  })
    .from(recurringExpenses)
    .innerJoin(group_members, and(
      eq(group_members.group_id, recurringExpenses.groupId),
      eq(group_members.user_id, recurringExpenses.userId),
    ))
    .innerJoin(users, eq(users.id, recurringExpenses.userId))
    .where(and(
      eq(recurringExpenses.userId, userId),
      eq(recurringExpenses.groupId, groupId),
      eq(users.active_telegram_group_id, groupId),
      eq(recurringExpenses.isActive, true),
      eq(recurringExpenses.autoConfirm, false),
      eq(recurringExpenses.frequency, "monthly"),
      eq(recurringExpenses.dayOfMonth, day),
    ));

  let created = 0;
  for (const definition of definitions) {
    const inserted = await db.insert(recurringExecutions).values({
      id: nanoid(),
      recurringExpenseId: definition.id,
      transactionId: null,
      scheduledDate: dueDate,
      executedAt: null,
      status: "pending",
      amountArs: definition.amountArs,
      createdAt: Date.now(),
    }).onConflictDoNothing({
      target: [recurringExecutions.recurringExpenseId, recurringExecutions.scheduledDate],
    }).returning({ id: recurringExecutions.id });
    created += inserted.length;
  }
  return created;
}
