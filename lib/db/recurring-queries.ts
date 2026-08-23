/**
 * Queries for Recurring Expenses management.
 * Handles CRUD operations, execution management, and statistics.
 */

import { getArgentinaDate } from "@/lib/utils/dates";
import { db } from "./client";
import { recurringExpenses, recurringExecutions, transactions, categories, users } from "./schema";
import { eq, and, desc, sql, gte, lte, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface CreateRecurringExpenseInput {
  userId: string;
  groupId?: string | null;
  name: string;
  amountArs: number;
  categoryId?: string | null;
  merchant?: string | null;
  frequency?: "monthly" | "weekly" | "yearly";
  dayOfMonth?: number;
  autoConfirm?: boolean;
  notes?: string | null;
}

export interface UpdateRecurringExpenseInput {
  name?: string;
  amountArs?: number;
  categoryId?: string | null;
  merchant?: string | null;
  frequency?: "monthly" | "weekly" | "yearly";
  dayOfMonth?: number;
  isActive?: boolean;
  autoConfirm?: boolean;
  notes?: string | null;
}

export interface RecurringExpenseWithCategory {
  id: string;
  userId: string;
  groupId: string | null;
  name: string;
  amountArs: number;
  categoryId: string | null;
  merchant: string | null;
  frequency: "monthly" | "weekly" | "yearly";
  dayOfMonth: number;
  isActive: boolean;
  autoConfirm: boolean;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  category: {
    id: string;
    name: string;
    emoji: string;
    slug: string;
  } | null;
}

export interface RecurringExecutionWithDetails {
  id: string;
  recurringExpenseId: string;
  transactionId: string | null;
  scheduledDate: string;
  executedAt: number | null;
  status: "pending" | "confirmed" | "skipped" | "auto_executed";
  amountArs: number | null;
  createdAt: number;
  recurringExpense: {
    id: string;
    name: string;
    amountArs: number;
    merchant: string | null;
    category: {
      id: string;
      name: string;
      emoji: string;
      slug: string;
    } | null;
  };
}

export interface RecurringStats {
  totalMonthly: number;
  totalActive: number;
  totalPaused: number;
  pendingThisMonth: number;
  confirmedThisMonth: number;
  skippedThisMonth: number;
  byCategory: Array<{
    categoryName: string;
    categoryEmoji: string;
    total: number;
    count: number;
  }>;
}

// ─────────────────────────────────────────────────────────────
// CRUD Operations
// ─────────────────────────────────────────────────────────────

/**
 * Get all recurring expenses for a user
 */
export async function getUserRecurringExpenses(
  userId: string,
  options?: { activeOnly?: boolean; groupId?: string }
): Promise<RecurringExpenseWithCategory[]> {
  const conditions = [eq(recurringExpenses.userId, userId)];

  if (options?.activeOnly) {
    conditions.push(eq(recurringExpenses.isActive, true));
  }

  // Include both matching groupId AND null groupId (for backwards compatibility)
  // This ensures recurrents created without groupId are still visible
  if (options?.groupId) {
    conditions.push(
      or(
        eq(recurringExpenses.groupId, options.groupId),
        isNull(recurringExpenses.groupId)
      )!
    );
  }

  const results = await db
    .select({
      id: recurringExpenses.id,
      userId: recurringExpenses.userId,
      groupId: recurringExpenses.groupId,
      name: recurringExpenses.name,
      amountArs: recurringExpenses.amountArs,
      categoryId: recurringExpenses.categoryId,
      merchant: recurringExpenses.merchant,
      frequency: recurringExpenses.frequency,
      dayOfMonth: recurringExpenses.dayOfMonth,
      isActive: recurringExpenses.isActive,
      autoConfirm: recurringExpenses.autoConfirm,
      notes: recurringExpenses.notes,
      createdAt: recurringExpenses.createdAt,
      updatedAt: recurringExpenses.updatedAt,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categorySlug: categories.slug,
    })
    .from(recurringExpenses)
    .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(recurringExpenses.createdAt));

  return results.map((r) => ({
    id: r.id,
    userId: r.userId,
    groupId: r.groupId,
    name: r.name,
    amountArs: r.amountArs,
    categoryId: r.categoryId,
    merchant: r.merchant,
    frequency: r.frequency as "monthly" | "weekly" | "yearly",
    dayOfMonth: r.dayOfMonth,
    isActive: r.isActive,
    autoConfirm: r.autoConfirm,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    category: r.categoryName
      ? {
          id: r.categoryId!,
          name: r.categoryName,
          emoji: r.categoryEmoji ?? "📦",
          slug: r.categorySlug ?? "",
        }
      : null,
  }));
}

/**
 * Get a single recurring expense by ID
 */
export async function getRecurringExpenseById(
  id: string
): Promise<RecurringExpenseWithCategory | null> {
  const results = await db
    .select({
      id: recurringExpenses.id,
      userId: recurringExpenses.userId,
      groupId: recurringExpenses.groupId,
      name: recurringExpenses.name,
      amountArs: recurringExpenses.amountArs,
      categoryId: recurringExpenses.categoryId,
      merchant: recurringExpenses.merchant,
      frequency: recurringExpenses.frequency,
      dayOfMonth: recurringExpenses.dayOfMonth,
      isActive: recurringExpenses.isActive,
      autoConfirm: recurringExpenses.autoConfirm,
      notes: recurringExpenses.notes,
      createdAt: recurringExpenses.createdAt,
      updatedAt: recurringExpenses.updatedAt,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categorySlug: categories.slug,
    })
    .from(recurringExpenses)
    .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
    .where(eq(recurringExpenses.id, id))
    .limit(1);

  if (results.length === 0) return null;

  const r = results[0];
  return {
    id: r.id,
    userId: r.userId,
    groupId: r.groupId,
    name: r.name,
    amountArs: r.amountArs,
    categoryId: r.categoryId,
    merchant: r.merchant,
    frequency: r.frequency as "monthly" | "weekly" | "yearly",
    dayOfMonth: r.dayOfMonth,
    isActive: r.isActive,
    autoConfirm: r.autoConfirm,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    category: r.categoryName
      ? {
          id: r.categoryId!,
          name: r.categoryName,
          emoji: r.categoryEmoji ?? "📦",
          slug: r.categorySlug ?? "",
        }
      : null,
  };
}

/**
 * Find recurring expense by name (case-insensitive, partial match)
 */
export async function findRecurringByName(
  userId: string,
  name: string
): Promise<RecurringExpenseWithCategory | null> {
  const normalizedName = name.toLowerCase().trim();
  const all = await getUserRecurringExpenses(userId);
  
  // Exact match first
  const exact = all.find((r) => r.name.toLowerCase() === normalizedName);
  if (exact) return exact;
  
  // Partial match
  const partial = all.find(
    (r) =>
      r.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(r.name.toLowerCase())
  );
  return partial ?? null;
}

/**
 * Create a new recurring expense
 */
export async function createRecurringExpense(
  input: CreateRecurringExpenseInput
): Promise<RecurringExpenseWithCategory> {
  const id = nanoid();
  const now = Date.now();

  await db.insert(recurringExpenses).values({
    id,
    userId: input.userId,
    groupId: input.groupId ?? null,
    name: input.name,
    amountArs: input.amountArs,
    categoryId: input.categoryId ?? null,
    merchant: input.merchant ?? null,
    frequency: input.frequency ?? "monthly",
    dayOfMonth: input.dayOfMonth ?? 1,
    isActive: true,
    autoConfirm: input.autoConfirm ?? false,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const created = await getRecurringExpenseById(id);
  if (!created) throw new Error("Failed to create recurring expense");
  return created;
}

/**
 * Update a recurring expense
 */
export async function updateRecurringExpense(
  id: string,
  input: UpdateRecurringExpenseInput
): Promise<RecurringExpenseWithCategory | null> {
  const existing = await getRecurringExpenseById(id);
  if (!existing) return null;

  await db
    .update(recurringExpenses)
    .set({
      ...input,
      updatedAt: Date.now(),
    })
    .where(eq(recurringExpenses.id, id));

  return getRecurringExpenseById(id);
}

/**
 * Delete a recurring expense
 */
export async function deleteRecurringExpense(id: string): Promise<boolean> {
  const result = await db
    .delete(recurringExpenses)
    .where(eq(recurringExpenses.id, id));
  return true;
}

/**
 * Toggle active status of a recurring expense
 */
export async function toggleRecurringExpense(
  id: string
): Promise<RecurringExpenseWithCategory | null> {
  const existing = await getRecurringExpenseById(id);
  if (!existing) return null;

  await db
    .update(recurringExpenses)
    .set({
      isActive: !existing.isActive,
      updatedAt: Date.now(),
    })
    .where(eq(recurringExpenses.id, id));

  return getRecurringExpenseById(id);
}

// ─────────────────────────────────────────────────────────────
// Execution Management
// ─────────────────────────────────────────────────────────────

/**
 * Get current month string (YYYY-MM format)
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Get today's date string (YYYY-MM-DD format)
 */
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Create executions for a user's active recurring expenses for a given month
 */
export async function createMonthlyExecutions(
  userId: string,
  month?: string
): Promise<number> {
  const targetMonth = month ?? getCurrentMonth();
  const activeRecurring = await getUserRecurringExpenses(userId, { activeOnly: true });
  
  let created = 0;
  
  for (const recurring of activeRecurring) {
    // Check if execution already exists for this month
    const existingExecution = await db
      .select({ id: recurringExecutions.id })
      .from(recurringExecutions)
      .where(
        and(
          eq(recurringExecutions.recurringExpenseId, recurring.id),
          sql`substr(${recurringExecutions.scheduledDate}, 1, 7) = ${targetMonth}`
        )
      )
      .limit(1);

    if (existingExecution.length > 0) continue;

    // Create scheduled date
    const day = Math.min(recurring.dayOfMonth, 28); // Safe day for all months
    const scheduledDate = `${targetMonth}-${String(day).padStart(2, "0")}`;

    // Create execution
    const executionId = nanoid();
    
    if (recurring.autoConfirm) {
      // Auto-execute: create transaction immediately
      const transactionId = await createTransactionFromRecurring(recurring, scheduledDate);
      
      await db.insert(recurringExecutions).values({
        id: executionId,
        recurringExpenseId: recurring.id,
        transactionId,
        scheduledDate,
        executedAt: Date.now(),
        status: "auto_executed",
        amountArs: recurring.amountArs,
        createdAt: Date.now(),
      });
    } else {
      // Pending: wait for user confirmation
      await db.insert(recurringExecutions).values({
        id: executionId,
        recurringExpenseId: recurring.id,
        transactionId: null,
        scheduledDate,
        executedAt: null,
        status: "pending",
        amountArs: recurring.amountArs,
        createdAt: Date.now(),
      });
    }
    
    created++;
  }
  
  return created;
}

/**
 * Get pending executions for a user
 */
export async function getPendingExecutions(
  userId: string,
  month?: string
): Promise<RecurringExecutionWithDetails[]> {
  const targetMonth = month ?? getCurrentMonth();

  const results = await db
    .select({
      id: recurringExecutions.id,
      recurringExpenseId: recurringExecutions.recurringExpenseId,
      transactionId: recurringExecutions.transactionId,
      scheduledDate: recurringExecutions.scheduledDate,
      executedAt: recurringExecutions.executedAt,
      status: recurringExecutions.status,
      amountArs: recurringExecutions.amountArs,
      createdAt: recurringExecutions.createdAt,
      recurringName: recurringExpenses.name,
      recurringAmount: recurringExpenses.amountArs,
      recurringMerchant: recurringExpenses.merchant,
      recurringCategoryId: recurringExpenses.categoryId,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categorySlug: categories.slug,
    })
    .from(recurringExecutions)
    .innerJoin(recurringExpenses, eq(recurringExecutions.recurringExpenseId, recurringExpenses.id))
    .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
    .where(
      and(
        eq(recurringExpenses.userId, userId),
        eq(recurringExecutions.status, "pending"),
        sql`substr(${recurringExecutions.scheduledDate}, 1, 7) = ${targetMonth}`
      )
    )
    .orderBy(recurringExecutions.scheduledDate);

  return results.map((r) => ({
    id: r.id,
    recurringExpenseId: r.recurringExpenseId,
    transactionId: r.transactionId,
    scheduledDate: r.scheduledDate,
    executedAt: r.executedAt,
    status: r.status as "pending" | "confirmed" | "skipped" | "auto_executed",
    amountArs: r.amountArs,
    createdAt: r.createdAt,
    recurringExpense: {
      id: r.recurringExpenseId,
      name: r.recurringName,
      amountArs: r.recurringAmount,
      merchant: r.recurringMerchant,
      category: r.categoryName
        ? {
            id: r.recurringCategoryId!,
            name: r.categoryName,
            emoji: r.categoryEmoji ?? "📦",
            slug: r.categorySlug ?? "",
          }
        : null,
    },
  }));
}

/**
 * Get all executions for a month (all statuses)
 */
export async function getMonthExecutions(
  userId: string,
  month?: string
): Promise<RecurringExecutionWithDetails[]> {
  const targetMonth = month ?? getCurrentMonth();

  const results = await db
    .select({
      id: recurringExecutions.id,
      recurringExpenseId: recurringExecutions.recurringExpenseId,
      transactionId: recurringExecutions.transactionId,
      scheduledDate: recurringExecutions.scheduledDate,
      executedAt: recurringExecutions.executedAt,
      status: recurringExecutions.status,
      amountArs: recurringExecutions.amountArs,
      createdAt: recurringExecutions.createdAt,
      recurringName: recurringExpenses.name,
      recurringAmount: recurringExpenses.amountArs,
      recurringMerchant: recurringExpenses.merchant,
      recurringCategoryId: recurringExpenses.categoryId,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categorySlug: categories.slug,
    })
    .from(recurringExecutions)
    .innerJoin(recurringExpenses, eq(recurringExecutions.recurringExpenseId, recurringExpenses.id))
    .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
    .where(
      and(
        eq(recurringExpenses.userId, userId),
        sql`substr(${recurringExecutions.scheduledDate}, 1, 7) = ${targetMonth}`
      )
    )
    .orderBy(recurringExecutions.scheduledDate);

  return results.map((r) => ({
    id: r.id,
    recurringExpenseId: r.recurringExpenseId,
    transactionId: r.transactionId,
    scheduledDate: r.scheduledDate,
    executedAt: r.executedAt,
    status: r.status as "pending" | "confirmed" | "skipped" | "auto_executed",
    amountArs: r.amountArs,
    createdAt: r.createdAt,
    recurringExpense: {
      id: r.recurringExpenseId,
      name: r.recurringName,
      amountArs: r.recurringAmount,
      merchant: r.recurringMerchant,
      category: r.categoryName
        ? {
            id: r.recurringCategoryId!,
            name: r.categoryName,
            emoji: r.categoryEmoji ?? "📦",
            slug: r.categorySlug ?? "",
          }
        : null,
    },
  }));
}

/**
 * Confirm an execution (create transaction)
 */
export async function confirmExecution(
  executionId: string,
  amount?: number
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  // Get execution details
  const execResults = await db
    .select()
    .from(recurringExecutions)
    .where(eq(recurringExecutions.id, executionId))
    .limit(1);

  if (execResults.length === 0) {
    return { success: false, error: "Ejecución no encontrada" };
  }

  const execution = execResults[0];

  if (execution.status !== "pending") {
    return { success: false, error: "Esta ejecución ya fue procesada" };
  }

  // Get recurring expense details
  const recurring = await getRecurringExpenseById(execution.recurringExpenseId);
  if (!recurring) {
    return { success: false, error: "Gasto recurrente no encontrado" };
  }

  const finalAmount = amount ?? recurring.amountArs;
  const transactionId = await createTransactionFromRecurring(recurring, execution.scheduledDate, finalAmount);

  // Update execution
  await db
    .update(recurringExecutions)
    .set({
      transactionId,
      executedAt: Date.now(),
      status: "confirmed",
      amountArs: finalAmount,
    })
    .where(eq(recurringExecutions.id, executionId));

  return { success: true, transactionId };
}

/**
 * Skip an execution
 */
export async function skipExecution(
  executionId: string
): Promise<{ success: boolean; error?: string }> {
  const execResults = await db
    .select()
    .from(recurringExecutions)
    .where(eq(recurringExecutions.id, executionId))
    .limit(1);

  if (execResults.length === 0) {
    return { success: false, error: "Ejecución no encontrada" };
  }

  const execution = execResults[0];

  if (execution.status !== "pending") {
    return { success: false, error: "Esta ejecución ya fue procesada" };
  }

  await db
    .update(recurringExecutions)
    .set({
      executedAt: Date.now(),
      status: "skipped",
    })
    .where(eq(recurringExecutions.id, executionId));

  return { success: true };
}

/**
 * Create a transaction from a recurring expense
 */
async function createTransactionFromRecurring(
  recurring: RecurringExpenseWithCategory,
  date: string,
  amount?: number
): Promise<string> {
  const transactionId = nanoid();
  const finalAmount = amount ?? recurring.amountArs;
  const month = date.substring(0, 7);

  // Get exchange rate for USD conversion
  const exchangeRate = 1200; // Default, should be fetched from settings

  await db.insert(transactions).values({
    id: transactionId,
    user_id: recurring.userId,
    group_id: recurring.groupId,
    category_id: recurring.categoryId ?? "imprevistos",
    amount_ars: finalAmount,
    amount_usd: finalAmount / exchangeRate,
    merchant: recurring.merchant ?? recurring.name,
    description: `Gasto recurrente: ${recurring.name}`,
    date,
    month,
    source: "recurring",
    status: "active",
    requiresReimbursement: false,
    is_exception: 0,
    created_at: Date.now(),
  });

  return transactionId;
}

// ─────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────

/**
 * Get recurring expense statistics for a user
 */
export async function getRecurringStats(userId: string): Promise<RecurringStats> {
  const all = await getUserRecurringExpenses(userId);
  const month = getCurrentMonth();
  const executions = await getMonthExecutions(userId, month);

  const active = all.filter((r) => r.isActive);
  const paused = all.filter((r) => !r.isActive);

  const totalMonthly = active.reduce((sum, r) => sum + r.amountArs, 0);

  const pending = executions.filter((e) => e.status === "pending");
  const confirmed = executions.filter((e) => e.status === "confirmed" || e.status === "auto_executed");
  const skipped = executions.filter((e) => e.status === "skipped");

  // Group by category
  const byCategory = new Map<string, { name: string; emoji: string; total: number; count: number }>();
  
  for (const r of active) {
    const catName = r.category?.name ?? "Sin categoría";
    const catEmoji = r.category?.emoji ?? "📦";
    const existing = byCategory.get(catName);
    
    if (existing) {
      existing.total += r.amountArs;
      existing.count += 1;
    } else {
      byCategory.set(catName, { name: catName, emoji: catEmoji, total: r.amountArs, count: 1 });
    }
  }

  return {
    totalMonthly,
    totalActive: active.length,
    totalPaused: paused.length,
    pendingThisMonth: pending.length,
    confirmedThisMonth: confirmed.length,
    skippedThisMonth: skipped.length,
    byCategory: Array.from(byCategory.values()).map((c) => ({
      categoryName: c.name,
      categoryEmoji: c.emoji,
      total: c.total,
      count: c.count,
    })),
  };
}

/**
 * Get executions due within N days, grouped by user
 */
export async function getUpcomingExecutions(
  days: number = 3
): Promise<Array<{ userId: string; telegramUserId: string | null; executions: RecurringExecutionWithDetails[] }>> {
  const today = getArgentinaDate();
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + days);
  const targetDateStr = [
    targetDate.getFullYear(),
    String(targetDate.getMonth() + 1).padStart(2, "0"),
    String(targetDate.getDate()).padStart(2, "0"),
  ].join("-");

  const results = await db
    .select({
      execId: recurringExecutions.id,
      recurringExpenseId: recurringExecutions.recurringExpenseId,
      scheduledDate: recurringExecutions.scheduledDate,
      status: recurringExecutions.status,
      amountArs: recurringExecutions.amountArs,
      createdAt: recurringExecutions.createdAt,
      recurringName: recurringExpenses.name,
      recurringAmount: recurringExpenses.amountArs,
      recurringMerchant: recurringExpenses.merchant,
      recurringCategoryId: recurringExpenses.categoryId,
      recurringUserId: recurringExpenses.userId,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categorySlug: categories.slug,
      userTelegramId: users.telegram_user_id,
    })
    .from(recurringExecutions)
    .innerJoin(recurringExpenses, eq(recurringExecutions.recurringExpenseId, recurringExpenses.id))
    .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
    .innerJoin(users, eq(recurringExpenses.userId, users.id))
    .where(
      and(
        eq(recurringExecutions.status, "pending"),
        eq(recurringExecutions.scheduledDate, targetDateStr)
      )
    );

  const byUser = new Map<string, { telegramUserId: string | null; executions: RecurringExecutionWithDetails[] }>();

  for (const r of results) {
    if (!byUser.has(r.recurringUserId)) {
      byUser.set(r.recurringUserId, { telegramUserId: r.userTelegramId, executions: [] });
    }
    byUser.get(r.recurringUserId)!.executions.push({
      id: r.execId,
      recurringExpenseId: r.recurringExpenseId,
      transactionId: null,
      scheduledDate: r.scheduledDate,
      executedAt: null,
      status: r.status as "pending",
      amountArs: r.amountArs,
      createdAt: r.createdAt,
      recurringExpense: {
        id: r.recurringExpenseId,
        name: r.recurringName,
        amountArs: r.recurringAmount,
        merchant: r.recurringMerchant,
        category: r.categoryName
          ? {
              id: r.recurringCategoryId!,
              name: r.categoryName,
              emoji: r.categoryEmoji!,
              slug: r.categorySlug!,
            }
          : null,
      },
    });
  }

  return Array.from(byUser.entries()).map(([userId, data]) => ({
    userId,
    ...data,
  }));
}

/**
 * Get executions past due date and still pending, grouped by user
 */
export async function getOverdueExecutions(): Promise<Array<{ userId: string; telegramUserId: string | null; executions: RecurringExecutionWithDetails[] }>> {
  const argentinaToday = getArgentinaDate();
  const today = [
    argentinaToday.getFullYear(),
    String(argentinaToday.getMonth() + 1).padStart(2, "0"),
    String(argentinaToday.getDate()).padStart(2, "0"),
  ].join("-");

  const results = await db
    .select({
      execId: recurringExecutions.id,
      recurringExpenseId: recurringExecutions.recurringExpenseId,
      scheduledDate: recurringExecutions.scheduledDate,
      status: recurringExecutions.status,
      amountArs: recurringExecutions.amountArs,
      createdAt: recurringExecutions.createdAt,
      recurringName: recurringExpenses.name,
      recurringAmount: recurringExpenses.amountArs,
      recurringMerchant: recurringExpenses.merchant,
      recurringCategoryId: recurringExpenses.categoryId,
      recurringUserId: recurringExpenses.userId,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categorySlug: categories.slug,
      userTelegramId: users.telegram_user_id,
    })
    .from(recurringExecutions)
    .innerJoin(recurringExpenses, eq(recurringExecutions.recurringExpenseId, recurringExpenses.id))
    .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
    .innerJoin(users, eq(recurringExpenses.userId, users.id))
    .where(
      and(
        eq(recurringExecutions.status, "pending"),
        sql`${recurringExecutions.scheduledDate} < ${today}`
      )
    );

  const byUser = new Map<string, { telegramUserId: string | null; executions: RecurringExecutionWithDetails[] }>();

  for (const r of results) {
    if (!byUser.has(r.recurringUserId)) {
      byUser.set(r.recurringUserId, { telegramUserId: r.userTelegramId, executions: [] });
    }
    byUser.get(r.recurringUserId)!.executions.push({
      id: r.execId,
      recurringExpenseId: r.recurringExpenseId,
      transactionId: null,
      scheduledDate: r.scheduledDate,
      executedAt: null,
      status: r.status as "pending",
      amountArs: r.amountArs,
      createdAt: r.createdAt,
      recurringExpense: {
        id: r.recurringExpenseId,
        name: r.recurringName,
        amountArs: r.recurringAmount,
        merchant: r.recurringMerchant,
        category: r.categoryName
          ? {
              id: r.recurringCategoryId!,
              name: r.categoryName,
              emoji: r.categoryEmoji!,
              slug: r.categorySlug!,
            }
          : null,
      },
    });
  }

  return Array.from(byUser.entries()).map(([userId, data]) => ({
    userId,
    ...data,
  }));
}
