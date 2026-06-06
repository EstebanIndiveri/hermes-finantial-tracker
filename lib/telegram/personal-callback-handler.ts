// lib/telegram/personal-callback-handler.ts
import { db } from "@/lib/db/client";
import {
  receipt_imports,
  transactions,
  categories,
  budgets,
  monthly_settings,
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
}

// ── Shared: register a transaction ──
async function registerPersonalTransaction(
  userId: string,
  groupId: string,
  categoryId: string,
  amountArs: number,
  merchant: string | undefined,
  isException: boolean
): Promise<string> {
  const month = getActiveMonthArgentina();
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
  });
  if (!settings || settings.exchange_rate <= 0) return "❌ Sin configuración mensual válida.";

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

  return formatTransactionConfirm({
    amount_ars: amountArs,
    category: cat?.name ?? "—",
    emoji: cat?.emoji ?? "📦",
    gastado_ars,
    budget_ars,
    disponible_ars,
    status,
    ahorro_proyectado_usd: summary?.ahorro_proyectado_usd ?? 0,
  });
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

      const resultText = await registerPersonalTransaction(
        userId, groupId, cat.id, pending.parsed_amount_ars, pending.parsed_merchant ?? undefined, false
      );

      await db.update(receipt_imports)
        .set({ status: "confirmed" })
        .where(eq(receipt_imports.id, pending.id))
        .catch((err) => console.error("Failed to mark receipt as confirmed:", err));

      return { text: resultText, edit: true };
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
        step: "receipt_edit_category",
        data: { import_id: pending.id },
      });
      return { text: "✏️ Enviá la categoría (ej: <code>supermercado</code>):", edit: true };
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

      const resultText = await registerPersonalTransaction(
        s.user_id, s.group_id, s.category_id, s.amount_ars, s.merchant, s.is_exception
      );
      return { text: resultText, edit: true };
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

      const resultText = await registerPersonalTransaction(
        s.user_id, s.group_id, s.category_id, s.amount_ars, s.merchant, true
      );
      return { text: `⚠️ Registrado como excepción.\n\n${resultText}`, edit: true };
    }

    if (data === "exception:cancel") {
      await clearConversationState(chatId, telegramUserId);
      return { text: "❌ Cancelado.", edit: true };
    }

    return { text: "❌ Acción no reconocida.", edit: false };
  } catch (err) {
    console.error("handlePersonalCallback error:", { data, message: err instanceof Error ? err.message : String(err) });
    return { text: "❌ Error interno. Intentá nuevamente.", edit: false };
  }
}
