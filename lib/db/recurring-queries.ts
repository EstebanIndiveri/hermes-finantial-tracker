/**
 * Queries for Recurring Expenses management.
 * Handles CRUD operations, execution management, and statistics.
 */

import { getArgentinaDate } from "@/lib/utils/dates";
import { db } from "./client";
import {
  recurringExpenses,
  recurringExecutions,
  transactions,
  categories,
  users,
  telegram_delivery_outbox,
} from "./schema";
import { eq, and, desc, sql, gte, lte, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { TelegramOperationContext } from "@/lib/telegram/operation-context";
import { createTelegramOperationIdentity } from "@/lib/telegram/operation-context";
import {
  runTelegramOperation,
  type TelegramOperationTransaction,
} from "@/lib/telegram/financial-operation";
import { buildTelegramDeliveryRow } from "@/lib/telegram/outbox";

type RecurringQueryExecutor = typeof db | TelegramOperationTransaction;

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
  id: string,
  executor: RecurringQueryExecutor = db,
): Promise<RecurringExpenseWithCategory | null> {
  const results = await executor
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
    const day = Math.min(recurring.dayOfMonth, 28); // Safe day for all months
    const scheduledDate = `${targetMonth}-${String(day).padStart(2, "0")}`;
    const executionId = nanoid();

    if (recurring.autoConfirm) {
      const inserted = await db.transaction(async (tx) => {
        const now = Date.now();
        const claimed = await tx.insert(recurringExecutions).values({
          id: executionId,
          recurringExpenseId: recurring.id,
          transactionId: null,
          scheduledDate,
          executedAt: null,
          status: "pending",
          amountArs: recurring.amountArs,
          createdAt: now,
        }).onConflictDoNothing({
          target: [recurringExecutions.recurringExpenseId, recurringExecutions.scheduledDate],
        }).returning({ id: recurringExecutions.id });
        if (claimed.length === 0) return false;

        const transactionId = await createTransactionFromRecurring(
          recurring,
          scheduledDate,
          undefined,
          tx,
          `recurring_execution:${executionId}`,
        );
        await tx.update(recurringExecutions).set({
          transactionId,
          executedAt: now,
          status: "auto_executed",
        }).where(eq(recurringExecutions.id, executionId));
        return true;
      });
      if (inserted) created += 1;
    } else {
      const inserted = await db.insert(recurringExecutions).values({
        id: executionId,
        recurringExpenseId: recurring.id,
        transactionId: null,
        scheduledDate,
        executedAt: null,
        status: "pending",
        amountArs: recurring.amountArs,
        createdAt: Date.now(),
      }).onConflictDoNothing({
        target: [recurringExecutions.recurringExpenseId, recurringExecutions.scheduledDate],
      }).returning({ id: recurringExecutions.id });
      if (inserted.length === 1) created += 1;
    }
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

/** Resolve an execution only when it belongs to the actor. */
async function getExecutionForActor(
  executionId: string,
  actorUserId: string,
  executor: RecurringQueryExecutor = db,
) {
  const results = await executor
    .select({
      id: recurringExecutions.id,
      recurringExpenseId: recurringExecutions.recurringExpenseId,
      transactionId: recurringExecutions.transactionId,
      scheduledDate: recurringExecutions.scheduledDate,
      executedAt: recurringExecutions.executedAt,
      status: recurringExecutions.status,
      amountArs: recurringExecutions.amountArs,
      createdAt: recurringExecutions.createdAt,
      ownerUserId: recurringExpenses.userId,
    })
    .from(recurringExecutions)
    .innerJoin(
      recurringExpenses,
      eq(recurringExecutions.recurringExpenseId, recurringExpenses.id),
    )
    .where(
      and(
        eq(recurringExecutions.id, executionId),
        eq(recurringExpenses.userId, actorUserId),
      ),
    )
    .limit(1);

  const execution = results[0];
  return execution?.ownerUserId === actorUserId ? execution : null;
}

/**
 * Confirm an execution (create transaction)
 */
export interface ConfirmExecutionResult {
  success: boolean;
  transactionId?: string;
  deliveryOperationId?: string;
  deliveryKey?: string;
  error?: string;
}

export interface ConfirmExecutionOptions {
  /** A batch operation can own the single user-facing response. */
  enqueuePrimaryResponse?: boolean;
}

class RecurringConfirmationRejected extends Error {
  constructor(public readonly reason: "not_found" | "processed") {
    super(reason);
  }
}

export async function confirmExecution(
  executionId: string,
  actorUserId: string,
  amount?: number,
  operationContext?: TelegramOperationContext,
  options?: ConfirmExecutionOptions,
): Promise<ConfirmExecutionResult> {
  if (operationContext) {
    const identity = createTelegramOperationIdentity({
      ...operationContext,
      action: "recurring.confirm",
      suffix: executionId,
    });
    const now = Date.now();
    let result: Awaited<ReturnType<typeof runTelegramOperation<{
      success: boolean;
      transactionId: string;
    }>>>;
    try {
      result = await runTelegramOperation<{
        success: boolean;
        transactionId: string;
      }>(
      (work) => db.transaction(work),
      {
        identity,
        botId: operationContext.botId,
        updateId: operationContext.updateId,
        operationKind: `recurring.confirm:${executionId}`,
        now,
      },
      async (tx) => {
        // Revalidate both ownership and pending status on the same transaction
        // that creates the transaction and commits the operation registry row.
        const execution = await getExecutionForActor(executionId, actorUserId, tx);
        if (!execution) throw new RecurringConfirmationRejected("not_found");
        if (execution.status !== "pending") throw new RecurringConfirmationRejected("processed");

        const recurring = await getRecurringExpenseById(execution.recurringExpenseId, tx);
        if (!recurring || recurring.userId !== actorUserId) {
          throw new RecurringConfirmationRejected("not_found");
        }

        const finalAmount = amount ?? recurring.amountArs;
        const transactionId = await createTransactionFromRecurring(
          recurring,
          execution.scheduledDate,
          finalAmount,
          tx,
          identity.operationId,
        );
        const changed = await tx
          .update(recurringExecutions)
          .set({
            transactionId,
            executedAt: now,
            status: "confirmed",
            amountArs: finalAmount,
          })
          .where(and(
            eq(recurringExecutions.id, executionId),
            eq(recurringExecutions.status, "pending"),
          ))
          .returning({ id: recurringExecutions.id });
        if (changed.length !== 1) throw new RecurringConfirmationRejected("processed");

        if (options?.enqueuePrimaryResponse !== false) {
          const text = `✅ Registrado: ${recurring.name} — $${finalAmount.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`;
          const messageId = operationContext.callbackMessageId;
          const editing = Number.isSafeInteger(messageId);
          await tx.insert(telegram_delivery_outbox).values(buildTelegramDeliveryRow({
            botId: operationContext.botId,
            updateId: operationContext.updateId,
            operationId: identity.operationId,
            deliveryKey: identity.deliveryKey,
            action: editing ? "edit_message" : "send_message",
            chatId: operationContext.chatId,
            ...(editing ? { messageId } : {}),
            text,
            now,
          }));
        }

        return {
          resourceType: "transaction",
          resourceId: transactionId,
          result: { success: true, transactionId },
        };
      },
      );
    } catch (error) {
      if (error instanceof RecurringConfirmationRejected) {
        return error.reason === "processed"
          ? { success: false, error: "Esta ejecución ya fue procesada" }
          : { success: false, error: "Ejecución no encontrada" };
      }
      throw error;
    }
    if (result.kind === "busy") {
      throw new Error("Recurring confirmation operation is already in progress");
    }
    return {
      ...result.result,
      ...(options?.enqueuePrimaryResponse === false
        ? {}
        : { deliveryOperationId: result.operationId, deliveryKey: identity.deliveryKey }),
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const execution = await getExecutionForActor(executionId, actorUserId, tx);
      if (!execution) throw new RecurringConfirmationRejected("not_found");
      if (execution.status !== "pending") throw new RecurringConfirmationRejected("processed");

      const recurring = await getRecurringExpenseById(execution.recurringExpenseId, tx);
      if (!recurring || recurring.userId !== actorUserId) {
        throw new RecurringConfirmationRejected("not_found");
      }

      const finalAmount = amount ?? recurring.amountArs;
      const transactionId = await createTransactionFromRecurring(
        recurring,
        execution.scheduledDate,
        finalAmount,
        tx,
      );
      const changed = await tx
        .update(recurringExecutions)
        .set({
          transactionId,
          executedAt: Date.now(),
          status: "confirmed",
          amountArs: finalAmount,
        })
        .where(and(
          eq(recurringExecutions.id, executionId),
          eq(recurringExecutions.status, "pending"),
        ))
        .returning({ id: recurringExecutions.id });
      if (changed.length !== 1) throw new RecurringConfirmationRejected("processed");

      return { success: true, transactionId };
    });
  } catch (error) {
    if (error instanceof RecurringConfirmationRejected) {
      return error.reason === "processed"
        ? { success: false, error: "Esta ejecución ya fue procesada" }
        : { success: false, error: "Ejecución no encontrada" };
    }
    throw error;
  }
}

/**
 * Skip an execution
 */
export async function skipExecution(
  executionId: string,
  actorUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const execution = await getExecutionForActor(executionId, actorUserId);
  if (!execution) {
    return { success: false, error: "Ejecución no encontrada" };
  }

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
  amount?: number,
  executor: RecurringQueryExecutor = db,
  operationId?: string,
): Promise<string> {
  const transactionId = nanoid();
  const finalAmount = amount ?? recurring.amountArs;
  const month = date.substring(0, 7);

  // Get exchange rate for USD conversion
  const exchangeRate = 1200; // Default, should be fetched from settings

  // Get category ID - fallback to "imprevistos" category if not set
  let categoryId = recurring.categoryId;
  if (!categoryId) {
    const fallbackCategory = await executor
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, "imprevistos"))
      .limit(1);
    categoryId = fallbackCategory[0]?.id ?? null;
  }

  if (!categoryId) {
    throw new Error("No se encontró categoría para la transacción");
  }

  await executor.insert(transactions).values({
    id: transactionId,
    ...(operationId ? { operation_id: operationId } : {}),
    user_id: recurring.userId,
    group_id: recurring.groupId,
    category_id: categoryId,
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
