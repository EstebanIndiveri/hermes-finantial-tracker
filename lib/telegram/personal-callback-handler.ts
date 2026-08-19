// lib/telegram/personal-callback-handler.ts
import { db } from "@/lib/db/client";
import {
  receipt_imports,
  transactions,
  categories,
  budgets,
  monthly_settings,
  groups,
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
import { buildReceiptProposalMessage } from "./handlers";
import { createReimbursementWithNotifications, markReimbursementAsPaidWithNotifications } from "@/lib/reimbursements/requests";
import { getGroupMembership, isAdminOrAbove } from "@/lib/groups/permissions";

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
      if (state?.step !== "expense_confirm") {
        return { text: "⏱️ Confirmación expirada. Volvé a escribir el gasto.", edit: true };
      }
      const s = state.data as PendingExpenseState;
      await clearConversationState(chatId, telegramUserId);

      const result = await registerPersonalTransaction(
        s.user_id, s.group_id, s.category_id, s.amount_ars, s.merchant, s.is_exception
      );
      if (!result.transactionId) {
        return { text: result.text, edit: true };
      }

      // If requires_reimbursement was detected from NL, create it automatically
      if (s.requires_reimbursement) {
        await createReimbursementWithNotifications(
          result.transactionId,
          s.user_id,
          s.amount_ars,
          undefined,
        );
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
        await createReimbursementWithNotifications(
          result.transactionId,
          s.user_id,
          s.amount_ars,
          undefined,
        );
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

    if (data.startsWith("expense:reimbursement_yes:")) {
      const state = await getConversationState(chatId, telegramUserId);
      const reimbursementState = state?.data as PendingExpenseReimbursementState | undefined;
      const transactionId = data.split(":")[2] ?? "";

      if (state?.step !== "expense_reimbursement_confirm" || !reimbursementState || reimbursementState.transaction_id !== transactionId) {
        return { text: "⏱️ Confirmación expirada.", edit: true };
      }

      await createReimbursementWithNotifications(
        reimbursementState.transaction_id,
        reimbursementState.user_id,
        reimbursementState.amount_ars,
        undefined,
      );
      await clearConversationState(chatId, telegramUserId);
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

    return { text: "❌ Acción no reconocida.", edit: false };
  } catch (err) {
    console.error("handlePersonalCallback error:", { data, message: err instanceof Error ? err.message : String(err) });
    return { text: "❌ Error interno. Intentá nuevamente.", edit: false };
  }
}
