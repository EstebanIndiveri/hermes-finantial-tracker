// lib/telegram/personal-callback-handler.ts
import { db } from "@/lib/db/client";
import {
  receipt_imports,
  transactions,
  categories,
  budgets,
  monthly_settings,
  groups,
  recurringExecutions,
} from "@/lib/db/schema";
import { eq, and, sum, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { getMonthSummary } from "@/lib/finance/summaries";
import { calculateCategoryStatus } from "@/lib/finance/rules";
import { formatTransactionConfirm } from "./formatters";
import { getConversationState, setConversationState, clearConversationState } from "./splits/conversation-state";
import type { InlineKeyboardMarkup } from "./send-message";
import { buildPersonalKeyboard } from "./send-message";
import { buildReceiptProposalMessage, buildRecurringSuggestionsMessage } from "./handlers";
import { createReimbursementWithNotifications, markReimbursementAsPaidWithNotifications, cancelReimbursementWithNotifications, getReimbursementByTransactionId } from "@/lib/reimbursements/requests";
import { getGroupMembership, isAdminOrAbove } from "@/lib/groups/permissions";
import {
  getUserRecurringExpenses,
  createRecurringExpense,
  toggleRecurringExpense,
  deleteRecurringExpense,
  getPendingExecutions,
  confirmExecution,
  skipExecution,
  getRecurringStats,
} from "@/lib/db/recurring-queries";
import { RECURRING_SUGGESTIONS, findSuggestionByName } from "@/lib/recurring/suggestions";

export interface PersonalCallbackResponse {
  text: string;
  edit: boolean;
  replyMarkup?: InlineKeyboardMarkup;
}

// ── Pending expense state (for /gasto confirmation and NL register_expense) ──
interface PendingExpenseState {
  step: "expense_confirm";
  category_id: string;
  category_name: string;
  category_emoji: string;
  amount_ars: number;
  merchant?: string;
  group_id: string;
  user_id: string;
  is_exception: boolean;
  requires_reimbursement?: boolean;
}

interface PendingExpenseReimbursementState {
  step: "expense_reimbursement_confirm";
  transaction_id: string;
  amount_ars: number;
  user_id: string;
  group_id: string;
}

function escapeHtml(text: string): string {
  return text.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c));
}

function buildEditedExpenseMessage(state: PendingExpenseState): PersonalCallbackResponse {
  const formatted = state.amount_ars.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  const lines = [
    `💳 <b>¿Registramos este gasto?</b> (✏️ editado)`,
    ``,
    `💰 <b>Monto:</b> $${formatted} ARS`,
    `📂 <b>Categoría:</b> ${state.category_emoji} ${state.category_name}`,
    state.merchant ? `🏪 <b>Comercio:</b> ${escapeHtml(state.merchant)}` : "",
    ``,
    `¿Todo bien?`,
  ].filter(Boolean);

  return {
    text: lines.join("\n"),
    edit: true,
    replyMarkup: buildPersonalKeyboard([
      [{ text: "✅ Confirmar", callback_data: "expense:confirm" }],
      [
        { text: "💰 Editar monto", callback_data: "expense:edit_amount" },
        { text: "📂 Editar categoría", callback_data: "expense:edit_category" },
      ],
      [
        { text: "🏪 Editar comercio", callback_data: "expense:edit_merchant" },
        { text: "❌ Cancelar", callback_data: "expense:cancel" },
      ],
    ]),
  };
}

// ── Shared: register a transaction ──
async function registerPersonalTransaction(
  userId: string,
  groupId: string,
  categoryId: string,
  amountArs: number,
  merchant: string | undefined,
  isException: boolean
): Promise<{ text: string; transactionId: string }> {
  const month = getActiveMonthArgentina();
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
  });
  if (!settings || settings.exchange_rate <= 0) return { text: "❌ Sin configuración mensual válida.", transactionId: "" };

  const amountUsd = parseFloat((amountArs / settings.exchange_rate).toFixed(2));
  const date = getArgentinaDate().toISOString().slice(0, 10);
  const txId = randomUUID();

  await db.insert(transactions).values({
    id: txId,
    user_id: userId,
    group_id: groupId,
    category_id: categoryId,
    amount_ars: amountArs,
    amount_usd: amountUsd,
    merchant: merchant ?? null,
    description: null,
    date,
    month,
    source: "telegram",
    status: "active",
    is_exception: isException ? 1 : 0,
  });

  const budget = await db.query.budgets.findFirst({
    where: and(eq(budgets.group_id, groupId), eq(budgets.month, month), eq(budgets.category_id, categoryId)),
  });

  const spentRows = await db
    .select({ total: sum(transactions.amount_ars) })
    .from(transactions)
    .where(and(
      eq(transactions.group_id, groupId),
      eq(transactions.month, month),
      eq(transactions.category_id, categoryId),
      eq(transactions.status, "active")
    ));
  const gastado_ars = Number(spentRows[0]?.total ?? 0);
  const budget_ars = budget?.budget_ars ?? 0;
  const disponible_ars = budget_ars > 0 ? Math.max(0, budget_ars - gastado_ars) : null;
  const status = calculateCategoryStatus({ gastado_ars, budget_ars });

  const cat = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) });
  const summary = await getMonthSummary(groupId, month);

  return {
    text: formatTransactionConfirm({
      amount_ars: amountArs,
      category: cat?.name ?? "—",
      emoji: cat?.emoji ?? "📦",
      gastado_ars,
      budget_ars,
      disponible_ars,
      status,
      ahorro_proyectado_usd: summary?.ahorro_proyectado_usd ?? 0,
    }),
    transactionId: txId,
  };
}

export async function handlePersonalCallback(
  chatId: string,
  telegramUserId: string,
  userId: string,
  groupId: string,
  data: string,
  messageId?: number
): Promise<PersonalCallbackResponse> {
  try {
    // ── receipt:* — OCR ticket callbacks ──────────────────────────────
    if (data === "receipt:confirm") {
      const rows = await db
        .select()
        .from(receipt_imports)
        .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
        .orderBy(desc(receipt_imports.created_at))
        .limit(1);
      const pending = rows[0] ?? null;

      if (!pending?.parsed_amount_ars || !pending.parsed_category_slug) {
        return { text: "❌ No hay ticket pendiente o faltan datos. Enviá la foto nuevamente.", edit: true };
      }

      const cat = await db.query.categories.findFirst({
        where: and(eq(categories.slug, pending.parsed_category_slug), eq(categories.group_id, groupId)),
      });
      if (!cat) {
        return {
          text: `⚠️ Categoría <b>${pending.parsed_category_slug}</b> no encontrada en tu grupo.\nEscribí la categoría correcta para continuar.`,
          edit: true,
        };
      }

      const result = await registerPersonalTransaction(
        userId, groupId, cat.id, pending.parsed_amount_ars, pending.parsed_merchant ?? undefined, false
      );

      await db.update(receipt_imports)
        .set({ status: "confirmed" })
        .where(eq(receipt_imports.id, pending.id))
        .catch((err) => console.error("Failed to mark receipt as confirmed:", err));

      return { text: result.text, edit: true };
    }

    if (data === "receipt:cancel") {
      await db.update(receipt_imports)
        .set({ status: "rejected" })
        .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
        .catch(() => {});
      return { text: "❌ Ticket cancelado.", edit: true };
    }

    if (data === "receipt:edit_amount") {
      const rows = await db.select().from(receipt_imports)
        .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
        .orderBy(desc(receipt_imports.created_at)).limit(1);
      const pending = rows[0] ?? null;
      if (!pending) return { text: "❌ No hay ticket pendiente.", edit: true };

      await setConversationState(chatId, telegramUserId, {
        step: "receipt_edit_amount",
        data: { import_id: pending.id },
      });
      return { text: "✏️ Enviá el nuevo monto (ej: <code>47000</code>):", edit: true };
    }

    if (data === "receipt:edit_category") {
      const rows = await db.select().from(receipt_imports)
        .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
        .orderBy(desc(receipt_imports.created_at)).limit(1);
      const pending = rows[0] ?? null;
      if (!pending) return { text: "❌ No hay ticket pendiente.", edit: true };

      await setConversationState(chatId, telegramUserId, {
        step: "receipt_select_category",
        data: { import_id: pending.id },
      });

      const cats = await db.select().from(categories).where(eq(categories.group_id, groupId));
      const kbRows: Array<Array<{ text: string; callback_data: string }>> = [];
      for (let i = 0; i < cats.length; i += 2) {
        const row: Array<{ text: string; callback_data: string }> = [
          { text: `${cats[i].emoji} ${cats[i].name}`, callback_data: `receipt:select_category:${cats[i].slug}` },
        ];
        if (cats[i + 1]) {
          row.push({
            text: `${cats[i + 1].emoji} ${cats[i + 1].name}`,
            callback_data: `receipt:select_category:${cats[i + 1].slug}`,
          });
        }
        kbRows.push(row);
      }
      kbRows.push([{ text: "❌ Cancelar", callback_data: "receipt:cancel" }]);

      return {
        text: "📂 <b>Seleccioná la categoría:</b>",
        replyMarkup: buildPersonalKeyboard(kbRows),
        edit: true,
      };
    }

    if (data === "receipt:edit_merchant") {
      const rows = await db.select().from(receipt_imports)
        .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
        .orderBy(desc(receipt_imports.created_at)).limit(1);
      const pending = rows[0] ?? null;
      if (!pending) return { text: "❌ No hay ticket pendiente.", edit: true };

      await setConversationState(chatId, telegramUserId, {
        step: "receipt_edit_merchant",
        data: { import_id: pending.id },
      });
      return { text: "✏️ Enviá el nombre del comercio (ej: <code>Carrefour</code>):", edit: true };
    }

    // ── expense:* — /gasto + NL expense confirmation ──────────────────
    if (data === "expense:confirm") {
      const state = await getConversationState(chatId, telegramUserId);
      
      // Check if already processing (clicked multiple times)
      if (state?.step === "expense_processing") {
        return { text: "⏳ Registrando gasto...", edit: true };
      }
      
      if (state?.step !== "expense_confirm") {
        // State expired - check if user has a recent transaction (within 2 minutes) to avoid duplicate
        const recentTx = await db.query.transactions.findFirst({
          where: and(
            eq(transactions.user_id, userId),
            eq(transactions.group_id, groupId),
            eq(transactions.status, "active"),
          ),
          orderBy: (t, { desc }) => desc(t.created_at),
        });
        
        // If a transaction was created very recently, it's likely a retry - silently confirm
        if (recentTx && (Date.now() - recentTx.created_at) < 2 * 60 * 1000) {
          return { text: "✅ Gasto ya registrado.", edit: true };
        }
        
        return { text: "⏱️ Confirmación expirada. Volvé a escribir el gasto.", edit: true };
      }
      
      const s = state.data as PendingExpenseState;
      
      // Mark as processing immediately to prevent duplicates
      await setConversationState(chatId, telegramUserId, {
        step: "expense_processing",
        data: s,
      });

      const result = await registerPersonalTransaction(
        s.user_id, s.group_id, s.category_id, s.amount_ars, s.merchant, s.is_exception
      );
      if (!result.transactionId) {
        await clearConversationState(chatId, telegramUserId);
        return { text: result.text, edit: true };
      }

      // If requires_reimbursement was detected from NL, create it automatically
      if (s.requires_reimbursement) {
        await clearConversationState(chatId, telegramUserId);
        const reimbResult = await createReimbursementWithNotifications(
          result.transactionId,
          s.user_id,
          s.amount_ars,
          undefined,
        );
        if ("error" in reimbResult) {
          return {
            text: `${result.text}\n\n⚠️ ${reimbResult.error}`,
            edit: true,
          };
        }
        return {
          text: `${result.text}\n\n✅ Reintegro solicitado automáticamente. Ya avisamos al grupo.`,
          edit: true,
        };
      }

      await setConversationState(chatId, telegramUserId, {
        step: "expense_reimbursement_confirm",
        data: {
          step: "expense_reimbursement_confirm",
          transaction_id: result.transactionId,
          amount_ars: s.amount_ars,
          user_id: s.user_id,
          group_id: s.group_id,
        } satisfies PendingExpenseReimbursementState,
      });

      return {
        text: `${result.text}\n\n¿Necesitás reintegro de este gasto?`,
        replyMarkup: buildPersonalKeyboard([[
          { text: "💸 Sí", callback_data: `expense:reimbursement_yes:${result.transactionId}` },
          { text: "❌ No", callback_data: `expense:reimbursement_no:${result.transactionId}` },
        ]]),
        edit: true,
      };
    }

    if (data === "expense:cancel") {
      await clearConversationState(chatId, telegramUserId);
      return { text: "❌ Gasto cancelado.", edit: true };
    }

    // ── expense:edit_* — Edit pending expense fields ─────────────────
    if (data === "expense:edit_amount") {
      const state = await getConversationState(chatId, telegramUserId);
      if (state?.step !== "expense_confirm") {
        return { text: "⏱️ Confirmación expirada.", edit: true };
      }
      await setConversationState(chatId, telegramUserId, {
        ...state,
        step: "expense_edit_amount",
      });
      return { 
        text: "💰 Escribí el nuevo monto (solo el número):", 
        edit: true 
      };
    }

    if (data === "expense:edit_category") {
      const state = await getConversationState(chatId, telegramUserId);
      const stateData = state?.data as PendingExpenseState | undefined;
      if (state?.step !== "expense_confirm" || !stateData) {
        return { text: "⏱️ Confirmación expirada.", edit: true };
      }
      
      const cats = await db.select().from(categories).where(eq(categories.group_id, stateData.group_id));
      const buttons = cats.map(c => ({
        text: `${c.emoji} ${c.name}`,
        callback_data: `expense:set_category:${c.id}`,
      }));
      const rows = [];
      for (let i = 0; i < buttons.length; i += 2) {
        rows.push(buttons.slice(i, i + 2));
      }
      rows.push([{ text: "❌ Cancelar", callback_data: "expense:cancel" }]);
      
      return { 
        text: "📂 Seleccioná la categoría:", 
        edit: true,
        replyMarkup: buildPersonalKeyboard(rows),
      };
    }

    if (data.startsWith("expense:set_category:")) {
      const categoryId = data.replace("expense:set_category:", "");
      const state = await getConversationState(chatId, telegramUserId);
      const stateData = state?.data as PendingExpenseState | undefined;
      if (state?.step !== "expense_confirm" || !stateData) {
        return { text: "⏱️ Confirmación expirada.", edit: true };
      }
      
      const cat = await db.query.categories.findFirst({
        where: eq(categories.id, categoryId),
      });
      if (!cat) {
        return { text: "❌ Categoría no encontrada.", edit: true };
      }
      
      const updatedState: PendingExpenseState = {
        ...stateData,
        category_id: cat.id,
        category_name: cat.name,
        category_emoji: cat.emoji,
      };
      await setConversationState(chatId, telegramUserId, {
        step: "expense_confirm",
        data: updatedState,
      });
      
      return buildEditedExpenseMessage(updatedState);
    }

    if (data === "expense:edit_merchant") {
      const state = await getConversationState(chatId, telegramUserId);
      if (state?.step !== "expense_confirm") {
        return { text: "⏱️ Confirmación expirada.", edit: true };
      }
      await setConversationState(chatId, telegramUserId, {
        ...state,
        step: "expense_edit_merchant",
      });
      return { 
        text: "🏪 Escribí el nombre del comercio:", 
        edit: true 
      };
    }

    // Handle category selection from voice/text expense (when category not detected)
    if (data.startsWith("expense:select_category:")) {
      const slug = data.replace("expense:select_category:", "");
      const state = await getConversationState(chatId, telegramUserId);
      interface ExpenseSelectCategoryState {
        amount_ars: number;
        merchant: string | null;
        user_id: string;
        group_id: string;
        requires_reimbursement: boolean;
      }
      const stateData = state?.data as ExpenseSelectCategoryState | undefined;
      if (state?.step !== "expense_select_category" || !stateData) {
        return { text: "⏱️ Selección expirada.", edit: true };
      }

      const cat = await db.query.categories.findFirst({
        where: and(eq(categories.slug, slug), eq(categories.group_id, stateData.group_id)),
      });
      if (!cat) {
        return { text: "❌ Categoría no encontrada.", edit: true };
      }

      // Transition to expense_confirm state with full data
      const newState: PendingExpenseState = {
        step: "expense_confirm",
        category_id: cat.id,
        category_name: cat.name,
        category_emoji: cat.emoji,
        amount_ars: stateData.amount_ars,
        merchant: stateData.merchant ?? undefined,
        group_id: stateData.group_id,
        user_id: stateData.user_id,
        is_exception: false,
        requires_reimbursement: stateData.requires_reimbursement,
      };
      await setConversationState(chatId, telegramUserId, {
        step: "expense_confirm",
        data: newState,
      });

      return buildEditedExpenseMessage(newState);
    }

    // ── exception:* — budget exception confirmation ────────────────────
    if (data === "exception:confirm") {
      const state = await getConversationState(chatId, telegramUserId);
      const stateData = state?.data as PendingExpenseState | undefined;
      if (state?.step !== "expense_confirm" || !stateData?.is_exception) {
        return { text: "⏱️ Confirmación expirada.", edit: true };
      }
      const s = stateData;
      await clearConversationState(chatId, telegramUserId);

      const result = await registerPersonalTransaction(
        s.user_id, s.group_id, s.category_id, s.amount_ars, s.merchant, true
      );
      if (!result.transactionId) {
        return { text: result.text, edit: true };
      }

      // If requires_reimbursement was detected from NL, create it automatically
      if (s.requires_reimbursement) {
        const reimbResult = await createReimbursementWithNotifications(
          result.transactionId,
          s.user_id,
          s.amount_ars,
          undefined,
        );
        if ("error" in reimbResult) {
          return {
            text: `⚠️ Registrado como excepción.\n\n${result.text}\n\n⚠️ ${reimbResult.error}`,
            edit: true,
          };
        }
        return {
          text: `⚠️ Registrado como excepción.\n\n${result.text}\n\n✅ Reintegro solicitado automáticamente. Ya avisamos al grupo.`,
          edit: true,
        };
      }

      await setConversationState(chatId, telegramUserId, {
        step: "expense_reimbursement_confirm",
        data: {
          step: "expense_reimbursement_confirm",
          transaction_id: result.transactionId,
          amount_ars: s.amount_ars,
          user_id: s.user_id,
          group_id: s.group_id,
        } satisfies PendingExpenseReimbursementState,
      });

      return {
        text: `⚠️ Registrado como excepción.\n\n${result.text}\n\n¿Necesitás reintegro de este gasto?`,
        replyMarkup: buildPersonalKeyboard([[
          { text: "💸 Sí", callback_data: `expense:reimbursement_yes:${result.transactionId}` },
          { text: "❌ No", callback_data: `expense:reimbursement_no:${result.transactionId}` },
        ]]),
        edit: true,
      };
    }

    if (data === "exception:cancel") {
      await clearConversationState(chatId, telegramUserId);
      return { text: "❌ Cancelado.", edit: true };
    }

    if (data.startsWith("receipt:select_category:")) {
      const slug = data.split(":")[2] ?? "";
      if (!slug) return { text: "❌ Categoría inválida.", edit: true };

      // Get import_id from conversation state (set by edit_category or buildCategoryKeyboard)
      const state = await getConversationState(chatId, telegramUserId);
      const importId = (state?.data as { import_id?: string } | undefined)?.import_id ?? null;

      let pending = null;
      if (importId) {
        const rows = await db.select().from(receipt_imports).where(eq(receipt_imports.id, importId)).limit(1);
        pending = rows[0] ?? null;
      }
      if (!pending) {
        const rows = await db.select().from(receipt_imports)
          .where(and(eq(receipt_imports.user_id, userId), eq(receipt_imports.status, "pending")))
          .orderBy(desc(receipt_imports.created_at))
          .limit(1);
        pending = rows[0] ?? null;
      }
      if (!pending) return { text: "❌ No hay ticket pendiente. Enviá la foto nuevamente.", edit: true };

      const cat = await db.query.categories.findFirst({
        where: and(eq(categories.slug, slug), eq(categories.group_id, groupId)),
      });
      if (!cat) return { text: `❌ Categoría <b>${slug}</b> no encontrada en tu grupo.`, edit: true };

      await db.update(receipt_imports)
        .set({ parsed_category_slug: slug })
        .where(eq(receipt_imports.id, pending.id))
        .catch((err) => console.error("Failed to update receipt category:", err));

      await clearConversationState(chatId, telegramUserId);

      const amount = pending.parsed_amount_ars!;
      const merchant = pending.parsed_merchant ?? undefined;
      const date = pending.parsed_date ?? new Date().toISOString().slice(0, 10);

      const proposal = buildReceiptProposalMessage({
        amount_ars: amount,
        categoryName: cat.name,
        categoryEmoji: cat.emoji,
        merchant,
        date,
        source: "edit",
      });

      return { ...proposal, edit: true };
    }

    if (data.startsWith("pay_reimbursement:")) {
      const reimbursementId = data.split(":")[1] ?? "";
      if (!reimbursementId) {
        return { text: "❌ Reintegro inválido.", edit: true };
      }

      const paid = await markReimbursementAsPaidWithNotifications(reimbursementId, userId);
      return {
        text: paid ? "✅ Reintegro marcado como pagado." : "❌ No se pudo marcar el reintegro como pagado.",
        edit: true,
      };
    }

    if (data.startsWith("cancel_reimbursement:")) {
      const reimbursementId = data.split(":")[1] ?? "";
      if (!reimbursementId) {
        return { text: "❌ Reintegro inválido.", edit: true };
      }

      const cancelled = await cancelReimbursementWithNotifications(reimbursementId, userId);
      return {
        text: cancelled 
          ? "✅ Reintegro cancelado. Se notificó al grupo." 
          : "❌ No se pudo cancelar el reintegro. Solo el solicitante puede cancelarlo.",
        edit: true,
      };
    }

    if (data.startsWith("expense:reimbursement_yes:")) {
      const state = await getConversationState(chatId, telegramUserId);
      const reimbursementState = state?.data as PendingExpenseReimbursementState | undefined;
      const transactionId = data.split(":")[2] ?? "";

      // Idempotent check: if reimbursement already exists for this transaction, confirm it
      const existingReimbursement = await getReimbursementByTransactionId(transactionId);
      if (existingReimbursement) {
        await clearConversationState(chatId, telegramUserId);
        if (existingReimbursement.status === "pending") {
          return { text: "✅ El reintegro ya fue solicitado. Esperando pago.", edit: true };
        } else if (existingReimbursement.status === "paid") {
          return { text: "✅ El reintegro ya fue pagado.", edit: true };
        }
        return { text: "✅ Reintegro ya procesado.", edit: true };
      }

      // If state expired but transaction exists, try to create reimbursement directly
      if (state?.step !== "expense_reimbursement_confirm" || !reimbursementState || reimbursementState.transaction_id !== transactionId) {
        // Verify transaction exists and get details
        const [tx] = await db
          .select({ id: transactions.id, amount_ars: transactions.amount_ars })
          .from(transactions)
          .where(eq(transactions.id, transactionId));
        
        if (!tx) {
          return { text: "⏱️ Confirmación expirada. Volvé a registrar el gasto.", edit: true };
        }
        
        // Create reimbursement directly using transaction data
        const reimbResult = await createReimbursementWithNotifications(
          transactionId,
          userId,
          tx.amount_ars,
          undefined,
        );
        if ("error" in reimbResult) {
          return { text: `⚠️ ${reimbResult.error}`, edit: true };
        }
        return { text: "✅ Reintegro solicitado. Ya avisamos al grupo.", edit: true };
      }

      const reimbResult = await createReimbursementWithNotifications(
        reimbursementState.transaction_id,
        reimbursementState.user_id,
        reimbursementState.amount_ars,
        undefined,
      );
      await clearConversationState(chatId, telegramUserId);
      if ("error" in reimbResult) {
        return { text: `⚠️ ${reimbResult.error}`, edit: true };
      }
      return { text: "✅ Reintegro solicitado. Ya avisamos al grupo.", edit: true };
    }

    if (data.startsWith("expense:reimbursement_no:")) {
      await clearConversationState(chatId, telegramUserId);
      return { text: "✅ Gasto registrado sin reintegro.", edit: true };
    }

    // ── partner:* — Configure group partner ──────────────────────────
    if (data.startsWith("partner:select:")) {
      const membership = await getGroupMembership(userId, groupId);
      const canManage = membership && isAdminOrAbove(membership.role);
      if (!canManage) {
        return { text: "❌ Solo administradores pueden configurar el partner.", edit: true };
      }

      const selectedUserId = data.split(":")[2] ?? "";
      if (!selectedUserId) {
        return { text: "❌ Usuario inválido.", edit: true };
      }

      try {
        await db.update(groups).set({ partner_id: selectedUserId }).where(eq(groups.id, groupId));
        return { text: "✅ Partner actualizado correctamente.", edit: true };
      } catch (err) {
        console.error("Failed to update partner:", err);
        return { text: "❌ Error al actualizar partner.", edit: true };
      }
    }

    if (data === "partner:remove") {
      const membership = await getGroupMembership(userId, groupId);
      const canManage = membership && isAdminOrAbove(membership.role);
      if (!canManage) {
        return { text: "❌ Solo administradores pueden configurar el partner.", edit: true };
      }

      try {
        await db.update(groups).set({ partner_id: null }).where(eq(groups.id, groupId));
        return { text: "✅ Partner eliminado. Los reintegros serán abiertos para todo el grupo.", edit: true };
      } catch (err) {
        console.error("Failed to remove partner:", err);
        return { text: "❌ Error al eliminar partner.", edit: true };
      }
    }

    if (data === "partner:cancel") {
      return { text: "❌ Configuración de partner cancelada.", edit: true };
    }

    // ─────────────────────────────────────────────────────────────
    // Recurring Expenses Callbacks
    // ─────────────────────────────────────────────────────────────

    if (data === "recurring:list") {
      const expenses = await getUserRecurringExpenses(userId, { groupId });
      const stats = await getRecurringStats(userId);

      if (expenses.length === 0) {
        return {
          text: [
            `📅 <b>Gastos Recurrentes</b>`,
            ``,
            `No tenés gastos recurrentes configurados.`,
            ``,
            `Agregá tus pagos fijos (Netflix, alquiler, servicios).`,
          ].join("\n"),
          edit: true,
          replyMarkup: buildPersonalKeyboard([
            [{ text: "➕ Agregar recurrente", callback_data: "recurring:suggest" }],
          ]),
        };
      }

      const active = expenses.filter((e) => e.isActive);
      const paused = expenses.filter((e) => !e.isActive);

      const lines = [
        `📅 <b>Gastos Recurrentes</b>`,
        ``,
        `💰 Total mensual: <b>$${stats.totalMonthly.toLocaleString("es-AR")}</b>`,
        ``,
      ];

      if (active.length > 0) {
        lines.push(`<b>Activos:</b>`);
        active.forEach((e) => {
          const emoji = e.category?.emoji ?? "📦";
          lines.push(`${emoji} ${e.name} - $${e.amountArs.toLocaleString("es-AR")}`);
        });
        lines.push(``);
      }

      if (paused.length > 0) {
        lines.push(`<b>⏸️ Pausados:</b>`);
        paused.forEach((e) => {
          const emoji = e.category?.emoji ?? "📦";
          lines.push(`${emoji} <s>${e.name}</s>`);
        });
      }

      return {
        text: lines.join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [
            { text: "➕ Agregar", callback_data: "recurring:suggest" },
            { text: "📋 Pendientes", callback_data: "recurring:pending" },
          ],
          [{ text: "⚙️ Gestionar", callback_data: "recurring:manage" }],
        ]),
      };
    }

    // Manage recurring expenses (edit, delete, toggle)
    if (data === "recurring:manage") {
      const expenses = await getUserRecurringExpenses(userId, { groupId });

      if (expenses.length === 0) {
        return {
          text: "No tenés gastos recurrentes para gestionar.",
          edit: true,
          replyMarkup: buildPersonalKeyboard([
            [{ text: "➕ Agregar recurrente", callback_data: "recurring:suggest" }],
          ]),
        };
      }

      const lines = [
        `⚙️ <b>Gestionar Recurrentes</b>`,
        ``,
        `Seleccioná un gasto para ver opciones:`,
        ``,
      ];

      const rows: Array<Array<{ text: string; callback_data: string }>> = [];

      expenses.forEach((e) => {
        const emoji = e.category?.emoji ?? "📦";
        const status = e.isActive ? "" : " ⏸️";
        rows.push([{
          text: `${emoji} ${e.name}${status}`,
          callback_data: `recurring:actions:${e.id}`,
        }]);
      });

      rows.push([{ text: "⬅️ Volver", callback_data: "recurring:list" }]);

      return {
        text: lines.join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard(rows),
      };
    }

    // Show actions for a specific recurring expense
    if (data.startsWith("recurring:actions:")) {
      const expenseId = data.split(":")[2];
      const expenses = await getUserRecurringExpenses(userId, { groupId });
      const expense = expenses.find((e) => e.id === expenseId);

      if (!expense) {
        return { text: "❌ Gasto no encontrado.", edit: true };
      }

      const emoji = expense.category?.emoji ?? "📦";
      const statusText = expense.isActive ? "Activo" : "Pausado";
      const toggleText = expense.isActive ? "⏸️ Pausar" : "▶️ Activar";

      return {
        text: [
          `${emoji} <b>${expense.name}</b>`,
          ``,
          `💰 Monto: $${expense.amountArs.toLocaleString("es-AR")}/mes`,
          `📅 Día: ${expense.dayOfMonth}`,
          `📊 Estado: ${statusText}`,
          ``,
          `¿Qué querés hacer?`,
        ].join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📜 Historial", callback_data: `recurring:history:${expenseId}` }],
          [{ text: "💰 Cambiar monto", callback_data: `recurring:edit_amount:${expenseId}` }],
          [{ text: "📅 Cambiar día", callback_data: `recurring:edit_day:${expenseId}` }],
          [{ text: toggleText, callback_data: `recurring:toggle:${expenseId}` }],
          [{ text: "🗑️ Eliminar", callback_data: `recurring:delete_ask:${expenseId}` }],
          [{ text: "⬅️ Volver", callback_data: "recurring:manage" }],
        ]),
      };
    }

    // Edit day of recurring expense
    if (data.startsWith("recurring:edit_day:")) {
      const expenseId = data.split(":")[2];
      const expenses = await getUserRecurringExpenses(userId, { groupId });
      const expense = expenses.find((e) => e.id === expenseId);

      if (!expense) {
        return { text: "❌ Gasto no encontrado.", edit: true };
      }

      return {
        text: [
          `📅 <b>Cambiar día de vencimiento</b>`,
          ``,
          `${expense.category?.emoji ?? "📦"} ${expense.name}`,
          `Día actual: <b>${expense.dayOfMonth}</b>`,
          ``,
          `Seleccioná el nuevo día:`,
        ].join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [
            { text: "1", callback_data: `recurring:set_day:${expenseId}:1` },
            { text: "5", callback_data: `recurring:set_day:${expenseId}:5` },
            { text: "10", callback_data: `recurring:set_day:${expenseId}:10` },
          ],
          [
            { text: "15", callback_data: `recurring:set_day:${expenseId}:15` },
            { text: "20", callback_data: `recurring:set_day:${expenseId}:20` },
            { text: "25", callback_data: `recurring:set_day:${expenseId}:25` },
          ],
          [
            { text: "28", callback_data: `recurring:set_day:${expenseId}:28` },
            { text: "Fin de mes", callback_data: `recurring:set_day:${expenseId}:31` },
          ],
          [{ text: "⬅️ Volver", callback_data: `recurring:actions:${expenseId}` }],
        ]),
      };
    }

    // Set day of recurring expense
    if (data.startsWith("recurring:set_day:")) {
      const parts = data.split(":");
      const expenseId = parts[2];
      const newDay = parseInt(parts[3]);

      // Update day using PATCH API logic (direct DB update)
      const { recurringExpenses } = await import("@/lib/db/schema");
      await db
        .update(recurringExpenses)
        .set({ dayOfMonth: newDay, updatedAt: Date.now() })
        .where(eq(recurringExpenses.id, expenseId));

      return {
        text: `✅ Día de vencimiento actualizado a <b>${newDay}</b>.`,
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "⚙️ Gestionar", callback_data: "recurring:manage" }],
          [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
        ]),
      };
    }

    // Show payment history for recurring expense
    if (data.startsWith("recurring:history:")) {
      const expenseId = data.split(":")[2];
      const expenses = await getUserRecurringExpenses(userId, { groupId });
      const expense = expenses.find((e) => e.id === expenseId);

      if (!expense) {
        return { text: "❌ Gasto no encontrado.", edit: true };
      }

      // Get the 6 most recent executions
      const executions = await db
        .select()
        .from(recurringExecutions)
        .where(eq(recurringExecutions.recurringExpenseId, expenseId))
        .orderBy(desc(recurringExecutions.scheduledDate))
        .limit(6);

      if (executions.length === 0) {
        return {
          text: [
            `${expense.category?.emoji ?? "📦"} <b>${expense.name}</b>`,
            ``,
            `📜 <b>Historial de Pagos</b>`,
            ``,
            `Sin historial aún.`,
          ].join("\n"),
          edit: true,
          replyMarkup: buildPersonalKeyboard([
            [{ text: "⬅️ Volver", callback_data: `recurring:actions:${expenseId}` }],
          ]),
        };
      }

      // Group executions by month and format them
      const monthGroups: Record<string, typeof executions> = {};
      executions.forEach((exec) => {
        const monthKey = exec.scheduledDate.substring(0, 7); // "YYYY-MM"
        if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
        monthGroups[monthKey].push(exec);
      });

      const monthNames: Record<number, string> = {
        1: "Enero",
        2: "Febrero",
        3: "Marzo",
        4: "Abril",
        5: "Mayo",
        6: "Junio",
        7: "Julio",
        8: "Agosto",
        9: "Septiembre",
        10: "Octubre",
        11: "Noviembre",
        12: "Diciembre",
      };

      const historyLines: string[] = [
        `${expense.category?.emoji ?? "📦"} <b>${expense.name}</b>`,
        ``,
        `📜 <b>Historial de Pagos (últimos 6 meses)</b>`,
        ``,
      ];

      // Sort months in descending order
      const sortedMonths = Object.keys(monthGroups).sort().reverse();

      sortedMonths.forEach((monthKey) => {
        const [yearStr, monthStr] = monthKey.split("-");
        const monthNum = parseInt(monthStr, 10);
        const year = parseInt(yearStr, 10);
        const monthName = monthNames[monthNum] || monthKey;

        const monthExecutions = monthGroups[monthKey];

        // Get the most recent execution for this month to show status
        const latestExecution = monthExecutions[0]; // Already sorted by scheduledDate desc

        let statusEmoji = "⏳"; // Pending
        if (latestExecution.status === "confirmed" || latestExecution.status === "auto_executed") {
          statusEmoji = "✅"; // Confirmed/Paid
        } else if (latestExecution.status === "skipped") {
          statusEmoji = "⏭️"; // Skipped
        }

        // Format: "Agosto 2026: ✅ Pagado el 15/08"
        const dayOfMonth = latestExecution.scheduledDate.split("-")[2];
        const dateStr = `${dayOfMonth}/${monthStr}`;
        let statusText = `${statusEmoji} `;

        if (latestExecution.status === "confirmed" || latestExecution.status === "auto_executed") {
          statusText += `Pagado el ${dateStr}`;
        } else if (latestExecution.status === "skipped") {
          statusText += `Saltado el ${dateStr}`;
        } else {
          statusText += `Pendiente desde el ${dateStr}`;
        }

        historyLines.push(`${monthName} ${year}: ${statusText}`);
      });

      return {
        text: historyLines.join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "⬅️ Volver", callback_data: `recurring:actions:${expenseId}` }],
        ]),
      };
    }

    // Edit amount of recurring expense
    if (data.startsWith("recurring:edit_amount:")) {
      const expenseId = data.split(":")[2];
      const expenses = await getUserRecurringExpenses(userId, { groupId });
      const expense = expenses.find((e) => e.id === expenseId);

      if (!expense) {
        return { text: "❌ Gasto no encontrado.", edit: true };
      }

      const { setConversationState } = await import("./splits/conversation-state");
      await setConversationState(chatId, telegramUserId, {
        step: "recurring_edit_amount",
        data: { expense_id: expenseId },
      });

      return {
        text: [
          `💰 <b>Cambiar monto</b>`,
          ``,
          `${expense.category?.emoji ?? "📦"} ${expense.name}`,
          `Monto actual: <b>$${expense.amountArs.toLocaleString("es-AR")}</b>`,
          ``,
          `Escribí el nuevo monto:`,
        ].join("\n"),
        edit: true,
      };
    }

    // Toggle recurring expense (pause/activate)
    if (data.startsWith("recurring:toggle:")) {
      const expenseId = data.split(":")[2];
      const result = await toggleRecurringExpense(expenseId);

      if (!result) {
        return { text: "❌ Gasto no encontrado.", edit: true };
      }

      const newStatus = result.isActive ? "activado ▶️" : "pausado ⏸️";

      return {
        text: `✅ Gasto ${newStatus}.`,
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "⚙️ Gestionar", callback_data: "recurring:manage" }],
          [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
        ]),
      };
    }

    // Ask for delete confirmation
    if (data.startsWith("recurring:delete_ask:")) {
      const expenseId = data.split(":")[2];
      const expenses = await getUserRecurringExpenses(userId, { groupId });
      const expense = expenses.find((e) => e.id === expenseId);

      if (!expense) {
        return { text: "❌ Gasto no encontrado.", edit: true };
      }

      return {
        text: [
          `🗑️ <b>Eliminar gasto recurrente</b>`,
          ``,
          `¿Seguro que querés eliminar <b>${expense.name}</b>?`,
          ``,
          `Esta acción no se puede deshacer.`,
        ].join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "🗑️ Sí, eliminar", callback_data: `recurring:delete_confirm:${expenseId}` }],
          [{ text: "❌ Cancelar", callback_data: `recurring:actions:${expenseId}` }],
        ]),
      };
    }

    // Confirm delete
    if (data.startsWith("recurring:delete_confirm:")) {
      const expenseId = data.split(":")[2];
      const deleted = await deleteRecurringExpense(expenseId);

      if (!deleted) {
        return { text: "❌ No se pudo eliminar el gasto.", edit: true };
      }

      return {
        text: "✅ Gasto recurrente eliminado.",
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "⚙️ Gestionar", callback_data: "recurring:manage" }],
          [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
        ]),
      };
    }

    if (data === "recurring:suggest") {
      const msg = buildRecurringSuggestionsMessage();
      return { text: msg.text, edit: true, replyMarkup: msg.replyMarkup };
    }

    if (data.startsWith("recurring:category:")) {
      const categoryKey = data.split(":")[2];
      const category = RECURRING_SUGGESTIONS[categoryKey];
      
      if (!category) {
        return { text: "❌ Categoría no encontrada.", edit: true };
      }

      const rows = category.items.slice(0, 6).map((item) => [{
        text: `${item.emoji} ${item.name}${item.suggestedAmount ? ` (~$${item.suggestedAmount.toLocaleString("es-AR")})` : ""}`,
        callback_data: `recurring:select:${item.name}:${item.suggestedAmount ?? 0}:${item.category}`,
      }]);

      rows.push([{ text: "⬅️ Volver", callback_data: "recurring:suggest" }]);

      return {
        text: `${category.emoji} <b>${category.label}</b>\n\nElegí un gasto para agregar:`,
        edit: true,
        replyMarkup: buildPersonalKeyboard(rows),
      };
    }

    if (data.startsWith("recurring:select:")) {
      const parts = data.split(":");
      const name = parts[2];
      const suggestedAmount = parseFloat(parts[3]) || 0;
      const categorySlug = parts[4] || null;

      if (suggestedAmount > 0) {
        // Ask to confirm with suggested amount
        return {
          text: [
            `➕ <b>Agregar ${escapeHtml(name)}</b>`,
            ``,
            `Monto sugerido: $${suggestedAmount.toLocaleString("es-AR")}`,
            ``,
            `¿Confirmás este monto o querés cambiarlo?`,
          ].join("\n"),
          edit: true,
          replyMarkup: buildPersonalKeyboard([
            [{ text: `✅ $${suggestedAmount.toLocaleString("es-AR")}`, callback_data: `recurring:add_confirm:${name}:${suggestedAmount}:${categorySlug}` }],
            [{ text: "✏️ Otro monto", callback_data: `recurring:add_amount:${name}:${categorySlug}` }],
            [{ text: "❌ Cancelar", callback_data: "recurring:suggest" }],
          ]),
        };
      }

      // No suggested amount, ask for it
      await setConversationState(chatId, telegramUserId, {
        step: "recurring_amount",
        data: { name, category_slug: categorySlug },
      });

      return {
        text: [
          `➕ <b>Agregar ${escapeHtml(name)}</b>`,
          ``,
          `¿Cuál es el monto mensual?`,
          ``,
          `Escribí el monto (ej: 15000):`,
        ].join("\n"),
        edit: true,
      };
    }

    if (data.startsWith("recurring:add_confirm:")) {
      const parts = data.split(":");
      const name = parts[2];
      const amount = parseFloat(parts[3]);
      const categorySlug = parts[4] || null;

      // Ask for day of month before creating
      return {
        text: [
          `➕ <b>Agregar ${escapeHtml(name)}</b>`,
          ``,
          `💰 Monto: $${amount.toLocaleString("es-AR")}`,
          ``,
          `¿Qué día del mes vence este gasto?`,
        ].join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [
            { text: "1", callback_data: `recurring:add_final:${name}:${amount}:${categorySlug}:1` },
            { text: "5", callback_data: `recurring:add_final:${name}:${amount}:${categorySlug}:5` },
            { text: "10", callback_data: `recurring:add_final:${name}:${amount}:${categorySlug}:10` },
          ],
          [
            { text: "15", callback_data: `recurring:add_final:${name}:${amount}:${categorySlug}:15` },
            { text: "20", callback_data: `recurring:add_final:${name}:${amount}:${categorySlug}:20` },
            { text: "25", callback_data: `recurring:add_final:${name}:${amount}:${categorySlug}:25` },
          ],
          [
            { text: "28", callback_data: `recurring:add_final:${name}:${amount}:${categorySlug}:28` },
            { text: "Fin de mes", callback_data: `recurring:add_final:${name}:${amount}:${categorySlug}:31` },
          ],
          [{ text: "❌ Cancelar", callback_data: "recurring:suggest" }],
        ]),
      };
    }

    if (data.startsWith("recurring:add_final:")) {
      const parts = data.split(":");
      const name = parts[2];
      const amount = parseFloat(parts[3]);
      const categorySlug = parts[4] === "null" ? null : parts[4];
      const dayOfMonth = parseInt(parts[5]) || 1;

      let categoryId: string | null = null;
      let categoryName = "Sin categoría";
      let categoryEmoji = "📦";

      if (categorySlug) {
        const cat = await db.query.categories.findFirst({
          where: and(eq(categories.slug, categorySlug), eq(categories.group_id, groupId)),
        });
        if (cat) {
          categoryId = cat.id;
          categoryName = cat.name;
          categoryEmoji = cat.emoji;
        }
      }

      const created = await createRecurringExpense({
        userId,
        groupId,
        name,
        amountArs: amount,
        categoryId,
        merchant: name,
        frequency: "monthly",
        dayOfMonth,
      });

      return {
        text: [
          `✅ <b>Gasto recurrente creado</b>`,
          ``,
          `📅 <b>${escapeHtml(created.name)}</b>`,
          `💰 $${created.amountArs.toLocaleString("es-AR")} / mes`,
          `📂 ${categoryEmoji} ${categoryName}`,
          `📆 Día ${dayOfMonth} de cada mes`,
          ``,
          `Te recordaré este gasto el día ${dayOfMonth} de cada mes.`,
        ].join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
          [{ text: "➕ Agregar otro", callback_data: "recurring:suggest" }],
        ]),
      };
    }

    if (data.startsWith("recurring:toggle:")) {
      const recurringId = data.split(":")[2];
      const toggled = await toggleRecurringExpense(recurringId);

      if (!toggled) {
        return { text: "❌ Gasto recurrente no encontrado.", edit: true };
      }

      const emoji = toggled.category?.emoji ?? "📦";
      const status = toggled.isActive ? "✅ Activado" : "⏸️ Pausado";

      return {
        text: [
          `${status}`,
          ``,
          `${emoji} <b>${escapeHtml(toggled.name)}</b>`,
          `$${toggled.amountArs.toLocaleString("es-AR")} / mes`,
          ``,
          toggled.isActive ? "Se incluirá el próximo mes." : "No se generará hasta que lo actives.",
        ].join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
        ]),
      };
    }

    if (data.startsWith("recurring:delete:")) {
      const recurringId = data.split(":")[2];
      await deleteRecurringExpense(recurringId);

      return {
        text: "✅ Gasto recurrente eliminado.",
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
        ]),
      };
    }

    if (data === "recurring:pending") {
      const pending = await getPendingExecutions(userId);
      const stats = await getRecurringStats(userId);

      if (pending.length === 0) {
        return {
          text: [
            `📅 <b>Gastos Pendientes</b>`,
            ``,
            stats.confirmedThisMonth > 0
              ? `✅ Ya confirmaste ${stats.confirmedThisMonth} gasto${stats.confirmedThisMonth > 1 ? "s" : ""} este mes.`
              : `No tenés gastos recurrentes pendientes.`,
          ].join("\n"),
          edit: true,
          replyMarkup: buildPersonalKeyboard([
            [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
          ]),
        };
      }

      const total = pending.reduce(
        (sum, e) => sum + (e.amountArs ?? e.recurringExpense.amountArs),
        0
      );

      const lines = [
        `📅 <b>Gastos Pendientes del Mes</b>`,
        ``,
      ];

      pending.forEach((e, i) => {
        const emoji = e.recurringExpense.category?.emoji ?? "📦";
        const amount = e.amountArs ?? e.recurringExpense.amountArs;
        lines.push(`${i + 1}. ${emoji} ${e.recurringExpense.name} - $${amount.toLocaleString("es-AR")}`);
      });

      lines.push(``);
      lines.push(`<b>Total: $${total.toLocaleString("es-AR")}</b>`);

      const rows: Array<Array<{ text: string; callback_data: string }>> = [];
      pending.slice(0, 4).forEach((e) => {
        rows.push([
          { text: `✅ ${e.recurringExpense.name}`, callback_data: `recurring:confirm:${e.id}` },
          { text: `⏭️`, callback_data: `recurring:skip:${e.id}` },
        ]);
      });

      if (pending.length > 1) {
        rows.push([{ text: "✅ Confirmar todos", callback_data: "recurring:confirm_all" }]);
      }

      return {
        text: lines.join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard(rows),
      };
    }

    if (data.startsWith("recurring:confirm:")) {
      const execId = data.split(":")[2];
      const result = await confirmExecution(execId);

      if (!result.success) {
        return { text: `❌ ${result.error}`, edit: true };
      }

      return {
        text: "✅ Gasto registrado correctamente.",
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📋 Ver pendientes", callback_data: "recurring:pending" }],
          [{ text: "📊 Resumen", callback_data: "summary" }],
        ]),
      };
    }

    if (data.startsWith("recurring:skip:")) {
      const execId = data.split(":")[2];
      const result = await skipExecution(execId);

      if (!result.success) {
        return { text: `❌ ${result.error}`, edit: true };
      }

      return {
        text: "⏭️ Gasto saltado este mes.",
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📋 Ver pendientes", callback_data: "recurring:pending" }],
        ]),
      };
    }

    if (data === "recurring:confirm_all") {
      const pending = await getPendingExecutions(userId);
      let confirmed = 0;

      for (const exec of pending) {
        const result = await confirmExecution(exec.id);
        if (result.success) confirmed++;
      }

      return {
        text: `✅ ${confirmed} gasto${confirmed > 1 ? "s" : ""} registrado${confirmed > 1 ? "s" : ""}.`,
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📊 Resumen", callback_data: "summary" }],
          [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
        ]),
      };
    }

    // Day selection during conversational flow (after name and amount)
    if (data.startsWith("recurring:day_select:")) {
      const dayOfMonth = parseInt(data.split(":")[2]);
      
      // Get conversation state to retrieve name and amount
      const state = await getConversationState(chatId, telegramUserId);
      if (!state || state.step !== "recurring_day") {
        return { text: "❌ Sesión expirada. Empezá de nuevo.", edit: true };
      }

      const { name, amount, category_slug } = state.data as { name: string; amount: number; category_slug?: string };

      // Get category if available
      let categoryId: string | null = null;
      let categoryName = "Sin categoría";
      let categoryEmoji = "📦";

      if (category_slug) {
        const cat = await db.query.categories.findFirst({
          where: and(eq(categories.slug, category_slug), eq(categories.group_id, groupId)),
        });
        if (cat) {
          categoryId = cat.id;
          categoryName = cat.name;
          categoryEmoji = cat.emoji;
        }
      }

      // Create the recurring expense
      const created = await createRecurringExpense({
        userId,
        groupId,
        name,
        amountArs: amount,
        categoryId,
        merchant: name,
        frequency: "monthly",
        dayOfMonth,
      });

      await clearConversationState(chatId, telegramUserId);

      return {
        text: [
          `✅ <b>Gasto recurrente creado</b>`,
          ``,
          `📅 <b>${escapeHtml(created.name)}</b>`,
          `💰 $${created.amountArs.toLocaleString("es-AR")} / mes`,
          `📂 ${categoryEmoji} ${categoryName}`,
          `📆 Día ${dayOfMonth} de cada mes`,
          ``,
          `Te recordaré este gasto el día ${dayOfMonth} de cada mes.`,
        ].join("\n"),
        edit: true,
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
          [{ text: "➕ Agregar otro", callback_data: "recurring:suggest" }],
        ]),
      };
    }

    if (data === "recurring:cancel") {
      await clearConversationState(chatId, telegramUserId);
      return { text: "❌ Operación cancelada.", edit: true };
    }

    if (data === "recurring:custom") {
      await setConversationState(chatId, telegramUserId, {
        step: "recurring_name",
        data: {},
      });

      return {
        text: [
          `✏️ <b>Agregar Gasto Recurrente</b>`,
          ``,
          `Escribí el nombre del gasto (ej: Netflix, Alquiler):`,
        ].join("\n"),
        edit: true,
      };
    }

    return { text: "❌ Acción no reconocida.", edit: false };
  } catch (err) {
    console.error("handlePersonalCallback error:", { data, message: err instanceof Error ? err.message : String(err) });
    return { text: "❌ Error interno. Intentá nuevamente.", edit: false };
  }
}
