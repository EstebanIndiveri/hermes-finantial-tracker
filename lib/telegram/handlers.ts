import { db } from "@/lib/db/client";
import { transactions, categories, monthly_settings, budgets, bot_messages, receipt_imports, telegram_link_codes, users, groups, group_members } from "@/lib/db/schema";
import { eq, and, sum, desc, gt } from "drizzle-orm";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { calculateCategoryStatus, calculateMonthStatus } from "@/lib/finance/rules";
import { formatTransactionConfirm, formatResumen, formatDisponible, formatPuedo } from "./formatters";
import { ocrTelegramPhoto, ocrTelegramDocument } from "./ocr";
import { parseReceiptText } from "@/lib/ai/parse-receipt";
import { randomUUID } from "crypto";
import type { InlineKeyboardMarkup } from "./send-message";
import { sendTelegramMessage, buildPersonalKeyboard } from "./send-message";
import { setConversationState, clearConversationState } from "./splits/conversation-state";
import { getReimbursementsByUser, getOpenGroupReimbursements, type ReimbursementRequest } from "@/lib/reimbursements/requests";
import { getGroupMembership, isAdminOrAbove } from "@/lib/groups/permissions";
import {
  getUserRecurringExpenses,
  createRecurringExpense,
  findRecurringByName,
  toggleRecurringExpense,
  getPendingExecutions,
  confirmExecution,
  skipExecution,
  getRecurringStats,
  createMonthlyExecutions,
  type RecurringExpenseWithCategory,
  type RecurringExecutionWithDetails,
} from "@/lib/db/recurring-queries";
import { findSuggestionByName, RECURRING_SUGGESTIONS } from "@/lib/recurring/suggestions";

export interface PersonalBotMessage {
  text: string;
  replyMarkup?: InlineKeyboardMarkup;
}

interface PendingExpenseReimbursementState {
  step: "expense_reimbursement_confirm";
  transaction_id: string;
  amount_ars: number;
  user_id: string;
  group_id: string;
}

interface RecurringExecutionStatusDescriptor {
  badge: string;
  dueLabel: string;
}

/**
 * Parses a number from text, supporting:
 * - Standard numbers: "1500", "1.500", "1,500"
 * - Spanish words: "mil quinientos", "dos mil", "quince mil"
 * - Mixed: "15 mil", "1500 pesos"
 */
function parseAmountFromText(text: string): number | null {
  const normalized = text.toLowerCase().trim();
  
  // Remove common suffixes
  const cleaned = normalized
    .replace(/\s*pesos?\s*/gi, "")
    .replace(/\s*ars?\s*/gi, "")
    .replace(/\$\s*/g, "")
    .trim();
  
  // Check for "X mil" pattern FIRST (e.g., "15 mil", "quince mil")
  // This must come before direct number parsing because parseFloat("15 mil") returns 15
  if (/mil/i.test(cleaned)) {
    const units: Record<string, number> = {
      cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
      seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
      once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
      dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
      veinte: 20, veintiuno: 21, veintidós: 22, veintidos: 22, veintitrés: 23, veintitres: 23,
      veinticuatro: 24, veinticinco: 25, veintiséis: 26, veintiseis: 26,
      veintisiete: 27, veintiocho: 28, veintinueve: 29,
      treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
    };
    
    const milPattern = /(\d+|[a-záéíóúü]+)\s*mil/i;
    const milMatch = cleaned.match(milPattern);
    if (milMatch) {
      const prefix = milMatch[1];
      let prefixNum = parseFloat(prefix);
      if (isNaN(prefixNum)) {
        prefixNum = units[prefix] ?? 0;
      }
      if (prefixNum > 0) {
        return prefixNum * 1000;
      }
    }
    // Just "mil" alone = 1000
    if (/^\s*mil\s*$/i.test(cleaned)) {
      return 1000;
    }
  }
  
  // Try standard number parsing (handles 1500, 1.500, etc.)
  // Only if it's JUST a number (no text mixed in)
  const numStr = cleaned.replace(/\./g, "").replace(",", ".");
  if (/^[\d,.]+$/.test(cleaned)) {
    const directNum = parseFloat(numStr);
    if (!isNaN(directNum) && directNum > 0) {
      return directNum;
    }
  }
  
  // Spanish number words for full parsing (e.g., "mil quinientos")
  const units: Record<string, number> = {
    cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
    veinte: 20, veintiuno: 21, veintidós: 22, veintidos: 22, veintitrés: 23, veintitres: 23,
    veinticuatro: 24, veinticinco: 25, veintiséis: 26, veintiseis: 26,
    veintisiete: 27, veintiocho: 28, veintinueve: 29,
    treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  };
  const multipliers: Record<string, number> = {
    cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
    quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
    mil: 1000, millón: 1000000, millon: 1000000,
  };
  
  // Try to parse full Spanish number (e.g., "mil quinientos", "dos mil trescientos")
  let total = 0;
  let current = 0;
  const words = cleaned.split(/\s+/);
  
  for (const word of words) {
    if (units[word] !== undefined) {
      current += units[word];
    } else if (multipliers[word] !== undefined) {
      if (word === "mil") {
        current = current === 0 ? 1000 : current * 1000;
        total += current;
        current = 0;
      } else {
        current += multipliers[word];
      }
    } else {
      const num = parseFloat(word.replace(/\./g, "").replace(",", "."));
      if (!isNaN(num)) {
        current += num;
      }
    }
  }
  total += current;
  
  return total > 0 ? total : null;
}

function escapeHtml(text: string): string {
  return text.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c));
}

function formatRecurringScheduledDate(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}`;
}

function getDaysFromToday(date: string): number {
  const today = getArgentinaDate();
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return 0;
  }

  const target = new Date(year, month - 1, day);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = target.getTime() - todayStart.getTime();

  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function getRecurringExecutionStatus(execution: RecurringExecutionWithDetails): RecurringExecutionStatusDescriptor {
  if (execution.status !== "pending") {
    return {
      badge: "✅ Pagado",
      dueLabel: `pagado • vencía ${formatRecurringScheduledDate(execution.scheduledDate)}`,
    };
  }

  const daysUntilDue = getDaysFromToday(execution.scheduledDate);

  if (daysUntilDue > 0) {
    return {
      badge: "⏳ Pendiente",
      dueLabel: `vence ${formatRecurringScheduledDate(execution.scheduledDate)}`,
    };
  }

  if (daysUntilDue === 0) {
    return {
      badge: "⚠️ Vence hoy",
      dueLabel: `vence ${formatRecurringScheduledDate(execution.scheduledDate)}`,
    };
  }

  return {
    badge: `🚨 Vencido (${Math.abs(daysUntilDue)} día${Math.abs(daysUntilDue) === 1 ? "" : "s"})`,
    dueLabel: `vencía ${formatRecurringScheduledDate(execution.scheduledDate)}`,
  };
}

function buildExpenseConfirmationMessage(
  amount_ars: number,
  categoryName: string,
  categoryEmoji: string,
  merchant?: string
): PersonalBotMessage {
  const formatted = amount_ars.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  const lines = [
    `💳 <b>¿Registramos este gasto?</b>`,
    ``,
    `💰 <b>Monto:</b> $${formatted} ARS`,
    `📂 <b>Categoría:</b> ${categoryEmoji} ${categoryName}`,
    merchant ? `🏪 <b>Comercio:</b> ${escapeHtml(merchant)}` : "",
    ``,
    `¿Todo bien?`,
  ].filter(Boolean);

  return {
    text: lines.join("\n"),
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

function buildExpenseEditedMessage(data: {
  amount_ars: number;
  category_name: string;
  category_emoji: string;
  merchant?: string;
}): PersonalBotMessage {
  const formatted = data.amount_ars.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  const lines = [
    `💳 <b>¿Registramos este gasto?</b> (✏️ editado)`,
    ``,
    `💰 <b>Monto:</b> $${formatted} ARS`,
    `📂 <b>Categoría:</b> ${data.category_emoji} ${data.category_name}`,
    data.merchant ? `🏪 <b>Comercio:</b> ${escapeHtml(data.merchant)}` : "",
    ``,
    `¿Todo bien?`,
  ].filter(Boolean);

  return {
    text: lines.join("\n"),
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

/** Builds a category selection keyboard for voice/text expense when category not detected */
async function buildExpenseCategoryKeyboard(
  groupId: string,
  amount_ars: number,
  merchant: string | null,
  chatId: string,
  telegramUserId: string,
  userId: string,
  requiresReimbursement: boolean,
): Promise<PersonalBotMessage> {
  await setConversationState(chatId, telegramUserId, {
    step: "expense_select_category",
    data: {
      amount_ars,
      merchant,
      user_id: userId,
      group_id: groupId,
      requires_reimbursement: requiresReimbursement,
    },
  });

  const cats = await db.select().from(categories).where(eq(categories.group_id, groupId));

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < cats.length; i += 2) {
    const row: Array<{ text: string; callback_data: string }> = [
      { text: `${cats[i].emoji} ${cats[i].name}`, callback_data: `expense:select_category:${cats[i].slug}` },
    ];
    if (cats[i + 1]) {
      row.push({
        text: `${cats[i + 1].emoji} ${cats[i + 1].name}`,
        callback_data: `expense:select_category:${cats[i + 1].slug}`,
      });
    }
    rows.push(row);
  }
  rows.push([{ text: "❌ Cancelar", callback_data: "expense:cancel" }]);

  const text = [
    `🎤 <b>Gasto detectado</b>`,
    ``,
    `💰 <b>Monto:</b> $${amount_ars.toLocaleString("es-AR")} ARS`,
    merchant ? `🏪 <b>Comercio:</b> ${escapeHtml(merchant)}` : "",
    ``,
    `📂 <b>¿Qué categoría es?</b>`,
  ].filter(Boolean).join("\n");

  return { text, replyMarkup: buildPersonalKeyboard(rows) };
}

function buildReimbursementsMessage(
  reimbursements: ReimbursementRequest[],
  openGroupReimbursements: ReimbursementRequest[],
  userId: string,
): PersonalBotMessage {
  // User is assigned as payer
  const pendingToPay = reimbursements.filter(
    (reimbursement) => reimbursement.status === "pending" && reimbursement.payerId === userId,
  );
  // User is the requester - pending
  const pendingRequested = reimbursements.filter(
    (reimbursement) => reimbursement.status === "pending" && reimbursement.requesterId === userId,
  );
  // User's recently paid reimbursements (last 5)
  const recentlyPaid = reimbursements
    .filter((r) => r.status === "paid" && (r.requesterId === userId || r.payerId === userId))
    .slice(0, 5);
  // Open reimbursements from the group (no payer assigned, not requested by user)
  const openToPay = openGroupReimbursements.filter(
    (r) => r.status === "pending",
  );

  // Combine assigned + open as "to pay"
  const allToPay = [...pendingToPay, ...openToPay];

  const toPayLines = allToPay.length > 0
    ? allToPay.map((reimbursement) => {
        const openTag = reimbursement.payerId === null ? " (abierto)" : "";
        return `• $${reimbursement.amount.toLocaleString("es-AR")}${openTag}`;
      })
    : ["• No tenés reintegros pendientes para pagar."];
  
  const requestedLines = pendingRequested.length > 0
    ? pendingRequested.map((reimbursement) => `• $${reimbursement.amount.toLocaleString("es-AR")}`)
    : ["• No tenés reintegros solicitados pendientes."];

  const paidLines = recentlyPaid.length > 0
    ? recentlyPaid.map((r) => {
        const role = r.requesterId === userId ? "recibido" : "pagado";
        return `• $${r.amount.toLocaleString("es-AR")} (${role})`;
      })
    : ["• Sin historial reciente."];

  // Build keyboard with pay buttons + cancel buttons
  const keyboardRows: Array<Array<{ text: string; callback_data: string }>> = [];
  
  // Pay buttons for pending
  allToPay.forEach((reimbursement) => {
    const openTag = reimbursement.payerId === null ? " 🌐" : "";
    keyboardRows.push([{ 
      text: `✅ Pagar $${reimbursement.amount.toLocaleString("es-AR")}${openTag}`, 
      callback_data: `pay_reimbursement:${reimbursement.id}` 
    }]);
  });
  
  // Cancel buttons for requested
  pendingRequested.forEach((reimbursement) => {
    keyboardRows.push([{ 
      text: `❌ Cancelar $${reimbursement.amount.toLocaleString("es-AR")}`, 
      callback_data: `cancel_reimbursement:${reimbursement.id}` 
    }]);
  });

  return {
    text: [
      "💸 <b>Reintegros por pagar</b>",
      "",
      ...toPayLines,
      "",
      "🙋 <b>Reintegros solicitados</b>",
      "",
      ...requestedLines,
      "",
      "📜 <b>Historial reciente</b>",
      "",
      ...paidLines,
    ].join("\n"),
    replyMarkup: keyboardRows.length > 0 ? buildPersonalKeyboard(keyboardRows) : undefined,
  };
}

/**
 * Shared budget check logic for both /gasto and NL register_expense.
 * Checks budget constraints, calculates category status, and returns appropriate message.
 * Includes error handling for state persistence and database queries.
 */
async function buildExpenseOrExceptionMessage(
  chatId: string,
  telegramUserId: string,
  userId: string,
  groupId: string,
  month: string,
  cat: { id: string; name: string; emoji: string | null },
  amount_ars: number,
  merchant: string | undefined,
  requires_reimbursement?: boolean
): Promise<PersonalBotMessage> {
  const budget = await db.query.budgets.findFirst({
    where: and(
      eq(budgets.group_id, groupId),
      eq(budgets.month, month),
      eq(budgets.category_id, cat.id)
    ),
  });

  if (budget && budget.budget_ars > 0) {
    let gastado = 0;
    try {
      const spentRows = await db
        .select({ total: sum(transactions.amount_ars) })
        .from(transactions)
        .where(and(
          eq(transactions.group_id, groupId),
          eq(transactions.month, month),
          eq(transactions.category_id, cat.id),
          eq(transactions.status, "active")
        ));
      gastado = Number(spentRows[0]?.total ?? 0);
    } catch (err) {
      console.error("Failed to query spent amount:", err);
      return { text: "❌ Error consultando presupuesto. Intentá nuevamente." };
    }

    const catStatus = calculateCategoryStatus({ gastado_ars: gastado, budget_ars: budget.budget_ars });

    if (catStatus === "CLOSED" && budget.hard_limit) {
      return { text: `🔴 ${cat.name} está CERRADA con límite duro. No se puede registrar.` };
    }

    if (gastado + amount_ars > budget.budget_ars && budget.hard_limit) {
      return { text: `🔴 Este gasto excede el presupuesto de ${cat.name} (límite duro). No se puede registrar.` };
    }

    if (catStatus === "CLOSED" && !budget.hard_limit) {
      try {
        await setConversationState(chatId, telegramUserId, {
          step: "expense_confirm",
          data: {
            step: "expense_confirm",
            category_id: cat.id,
            category_name: cat.name,
            category_emoji: cat.emoji ?? "📦",
            amount_ars,
            merchant,
            group_id: groupId,
            user_id: userId,
            is_exception: true,
            requires_reimbursement: requires_reimbursement ?? false,
          },
        });
      } catch (err) {
        console.error("Failed to save conversation state:", err);
        return { text: "❌ Error al guardar. Intentá nuevamente." };
      }
      
      return {
        text: `⚠️ <b>${cat.name}</b> está CERRADA (sin límite duro).\nGastado: $${gastado.toLocaleString("es-AR")} / $${budget.budget_ars.toLocaleString("es-AR")}\n\n¿Registrar como excepción?`,
        replyMarkup: buildPersonalKeyboard([
          [
            { text: "⚠️ Sí, registrar igual", callback_data: "exception:confirm" },
            { text: "❌ Cancelar", callback_data: "exception:cancel" },
          ],
        ]),
      };
    }
  }

  // Normal case — show confirmation keyboard
  try {
    await setConversationState(chatId, telegramUserId, {
      step: "expense_confirm",
      data: {
        step: "expense_confirm",
        category_id: cat.id,
        category_name: cat.name,
        category_emoji: cat.emoji ?? "📦",
        amount_ars,
        merchant,
        group_id: groupId,
        user_id: userId,
        is_exception: false,
        requires_reimbursement: requires_reimbursement ?? false,
      },
    });
  } catch (err) {
    console.error("Failed to save conversation state:", err);
    return { text: "❌ Error al guardar. Intentá nuevamente." };
  }

  return buildExpenseConfirmationMessage(amount_ars, cat.name, cat.emoji ?? "📦", merchant);
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    caption?: string;
    chat: { id: number };
    from: { id: number };
    photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
    document?: { file_id: string; mime_type?: string; file_name?: string };
  };
}

/** Receipt proposals are persisted in receipt_imports table (status="pending") — no in-memory state needed */

export async function handleTelegramMessage(update: TelegramUpdate, userId: string, groupId: string): Promise<PersonalBotMessage> {
  const msg = update.message;
  if (!msg) return { text: "Mensaje no reconocido." };
  
  const text = (msg.text ?? "").trim();
  const chatId = String(msg.chat.id);
  const month = getActiveMonthArgentina();

  if (text === "/start") {
    return { text: "👋 Hola! Soy Hermes Finance.\n\nComandos:\n/gasto monto categoria descripcion\n/puedo monto [categoria]\n/resumen\n/disponible [categoria]\n/ultimo\n/borrar_ultimo\n/grupos — ver todos tus grupos\n/grupo [nombre] — ver o cambiar tu grupo activo\n\nTambién podés escribirme en lenguaje natural: \"¿Cuánto me queda en salidas pareja?\"" };
  }

  if (text === "/resumen") {
    const summary = await getMonthSummary(groupId, month);
    if (!summary) return { text: "No hay configuración para este mes. Configurá desde la web." };
    return { text: formatResumen({ month, ...summary }) };
  }

  if (text === "/reintegros") {
    const [reimbursements, openGroupReimbursements] = await Promise.all([
      getReimbursementsByUser(userId),
      getOpenGroupReimbursements(groupId, userId),
    ]);
    return buildReimbursementsMessage(reimbursements, openGroupReimbursements, userId);
  }

  // ── /partner - Configure group partner ──
  if (text === "/partner") {
    // Check if user is admin or owner
    const membership = await getGroupMembership(userId, groupId);
    const canManage = membership && isAdminOrAbove(membership.role);
    if (!canManage) {
      return { text: "❌ Solo administradores pueden configurar el partner del grupo." };
    }

    // Get group members
    const members = await db
      .select({
        id: users.id,
        name: users.name,
      })
      .from(group_members)
      .innerJoin(users, eq(group_members.user_id, users.id))
      .where(eq(group_members.group_id, groupId));

    if (members.length === 0) {
      return { text: "❌ No hay miembros en el grupo." };
    }

    // Get current partner
    const group = await db.query.groups.findFirst({
      where: eq(groups.id, groupId),
    });

    const currentPartner = group?.partner_id
      ? members.find(m => m.id === group.partner_id)
      : null;

    const kbRows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < members.length; i += 2) {
      const row: Array<{ text: string; callback_data: string }> = [{
        text: `${members[i].id === currentPartner?.id ? "✅ " : ""}${members[i].name}`,
        callback_data: `partner:select:${members[i].id}`,
      }];
      if (members[i + 1]) {
        row.push({
          text: `${members[i + 1].id === currentPartner?.id ? "✅ " : ""}${members[i + 1].name}`,
          callback_data: `partner:select:${members[i + 1].id}`,
        });
      }
      kbRows.push(row);
    }
    kbRows.push([{ text: "🚫 Quitar partner", callback_data: "partner:remove" }]);
    kbRows.push([{ text: "❌ Cancelar", callback_data: "partner:cancel" }]);

    return {
      text: `👥 <b>Configurar Partner del grupo</b>\n\n${currentPartner ? `Partner actual: <b>${currentPartner.name}</b>` : "Sin partner configurado"}\n\nEl partner recibe por defecto las solicitudes de reintegro.`,
      replyMarkup: buildPersonalKeyboard(kbRows),
    };
  }

  if (text.startsWith("/disponible")) {
    const rawArg = text.slice("/disponible".length).trim();

    // No argument → show all categories summary
    if (!rawArg) {
      const breakdown = await getCategoryBreakdown(groupId, month);
      const lines = breakdown
        .filter(c => c.budget_ars > 0)
        .map(c => {
          const icon = c.status === "OK" ? "🟢" : c.status === "WARNING" ? "🟡" : "🔴";
          const disp = c.disponible_ars !== null ? `$${c.disponible_ars.toLocaleString("es-AR")} disponible` : "sin límite";
          return `${icon} ${c.emoji} ${c.name}: ${disp}`;
        });
      return {
        text: lines.length > 0
          ? `<b>💰 Disponible este mes:</b>\n\n${lines.join("\n")}`
          : "Sin presupuestos configurados para este mes.",
      };
    }

    // Try exact slug match first (e.g. "salidas_pareja")
    const slugExact = rawArg.toLowerCase().replace(/\s+/g, "_");
    let cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, slugExact), eq(categories.group_id, groupId)),
    });

    // Fuzzy: if no exact match, search by partial name/slug
    if (!cat) {
      const allCats = await db.query.categories.findMany({ where: eq(categories.group_id, groupId) });
      const inputWords = rawArg.toLowerCase().split(/[\s_]+/).filter(Boolean);
      cat = allCats.find(c =>
        // slug contains all input words
        inputWords.every(w => c.slug.includes(w)) ||
        // name (lowercased) contains all input words
        inputWords.every(w => c.name.toLowerCase().includes(w))
      ) ?? undefined;
    }

    if (!cat) return { text: `No encontré la categoría "${rawArg}".\n\nUsá /disponible para ver todas las categorías.` };

    const breakdown = await getCategoryBreakdown(groupId, month);
    const catData = breakdown.find(c => c.id === cat!.id);
    if (!catData) return { text: `Sin datos para ${cat.name} este mes.` };

    return {
      text: formatDisponible({
        category: catData.name,
        emoji: catData.emoji,
        budget_ars: catData.budget_ars,
        gastado_ars: catData.gastado_ars,
        disponible_ars: catData.disponible_ars,
        status: catData.status,
      }),
    };
  }

  if (text === "/ultimo") {
    const last = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.group_id, groupId),
        eq(transactions.month, month),
        eq(transactions.status, "active")
      ),
      orderBy: (t, { desc }) => desc(t.created_at),
      with: { category: true },
    });
    if (!last) return { text: "No hay transacciones activas este mes." };
    const lastWithCat = last as typeof last & { category?: { emoji: string; name: string } };
    const catStr = `${lastWithCat.category?.emoji ?? ""} ${lastWithCat.category?.name ?? ""}`.trim();
    return { text: `Último: ${catStr} — $${last.amount_ars.toLocaleString("es-AR")}${last.merchant ? ` (${escapeHtml(last.merchant)})` : ""} — ${last.date}` };
  }

  if (text === "/borrar_ultimo") {
    const last = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.group_id, groupId),
        eq(transactions.month, month),
        eq(transactions.status, "active")
      ),
      orderBy: (t, { desc }) => desc(t.created_at),
    });
    if (!last) return { text: "No hay transacciones activas para borrar." };
    await db.update(transactions)
      .set({ status: "deleted", deleted_at: Date.now() })
      .where(and(eq(transactions.id, last.id), eq(transactions.group_id, groupId)));
    return { text: `✅ Eliminado: $${last.amount_ars.toLocaleString("es-AR")} del ${last.date}` };
  }

  // ── Intercept text replies for pending receipt edit states ─────────
  if (text && !text.startsWith("/")) {
    let editState = null;
    try {
      const { getConversationState } = await import("./splits/conversation-state");
      editState = await getConversationState(chatId, String(msg.from.id));
    } catch { /* ignore */ }
    
    if (editState?.step === "receipt_edit_amount") {
      const ed = editState.data as { import_id?: string };
      if (!ed?.import_id) return { text: "❌ Sesión inválida. Enviá la foto nuevamente." };
      const newAmount = parseFloat(text.replace(/[$\s.]/g, "").replace(",", ".").trim());
      if (isNaN(newAmount) || newAmount <= 0) return { text: "❌ Monto inválido. Enviá solo el número, ej: <code>47000</code>" };

      try {
        await db.update(receipt_imports).set({ parsed_amount_ars: newAmount }).where(eq(receipt_imports.id, ed.import_id));
      } catch (err) {
        console.error("Failed to update receipt:", err);
        return { text: "❌ Error al guardar. Intentá nuevamente." };
      }
      try {
        const { clearConversationState } = await import("./splits/conversation-state");
        await clearConversationState(chatId, String(msg.from.id));
      } catch { /* ignore */ }

      const rows = await db.select().from(receipt_imports).where(eq(receipt_imports.id, ed.import_id)).limit(1);
      const r = rows[0];
      if (!r) return { text: "❌ Ticket no encontrado." };
      const catRows = r.parsed_category_slug
        ? await db.select().from(categories).where(and(eq(categories.slug, r.parsed_category_slug), eq(categories.group_id, groupId))).limit(1)
        : [];
      return buildReceiptProposalMessage({
        amount_ars: newAmount,
        categoryName: catRows[0]?.name ?? r.parsed_category_slug ?? "sin categoría",
        categoryEmoji: catRows[0]?.emoji ?? "📦",
        merchant: r.parsed_merchant ?? undefined,
        date: r.parsed_date ?? getArgentinaDate().toISOString().slice(0, 10),
        source: "edit",
      });
    }

    if (editState?.step === "receipt_edit_category") {
      const ed = editState.data as { import_id?: string };
      if (!ed?.import_id) return { text: "❌ Sesión inválida. Enviá la foto nuevamente." };
      const slug = text.trim().toLowerCase().replace(/\s+/g, "_");
      const catRows = await db.select().from(categories).where(and(eq(categories.slug, slug), eq(categories.group_id, groupId))).limit(1);
      const cat = catRows[0];
      if (!cat) return { text: `❌ Categoría "<b>${slug}</b>" no encontrada. Intentá con otro nombre.` };

      try {
        await db.update(receipt_imports).set({ parsed_category_slug: slug }).where(eq(receipt_imports.id, ed.import_id));
      } catch (err) {
        console.error("Failed to update receipt:", err);
        return { text: "❌ Error al guardar. Intentá nuevamente." };
      }
      try {
        const { clearConversationState } = await import("./splits/conversation-state");
        await clearConversationState(chatId, String(msg.from.id));
      } catch { /* ignore */ }

      const rows = await db.select().from(receipt_imports).where(eq(receipt_imports.id, ed.import_id)).limit(1);
      const r = rows[0];
      if (!r?.parsed_amount_ars) return { text: "❌ Ticket no encontrado." };
      return buildReceiptProposalMessage({
        amount_ars: r.parsed_amount_ars,
        categoryName: cat.name,
        categoryEmoji: cat.emoji ?? "📦",
        merchant: r.parsed_merchant ?? undefined,
        date: r.parsed_date ?? getArgentinaDate().toISOString().slice(0, 10),
        source: "edit",
      });
    }

    if (editState?.step === "receipt_edit_merchant") {
      const ed = editState.data as { import_id?: string };
      if (!ed?.import_id) return { text: "❌ Sesión inválida. Enviá la foto nuevamente." };
      const newMerchant = text.trim().slice(0, 100);
      try {
        await db.update(receipt_imports).set({ parsed_merchant: newMerchant }).where(eq(receipt_imports.id, ed.import_id));
      } catch (err) {
        console.error("Failed to update receipt:", err);
        return { text: "❌ Error al guardar. Intentá nuevamente." };
      }
      try {
        const { clearConversationState } = await import("./splits/conversation-state");
        await clearConversationState(chatId, String(msg.from.id));
      } catch { /* ignore */ }

      const rows = await db.select().from(receipt_imports).where(eq(receipt_imports.id, ed.import_id)).limit(1);
      const r = rows[0];
      if (!r?.parsed_amount_ars) return { text: "❌ Ticket no encontrado." };
      const catDispRows = r.parsed_category_slug
        ? await db.select().from(categories).where(and(eq(categories.slug, r.parsed_category_slug), eq(categories.group_id, groupId))).limit(1)
        : [];
      return buildReceiptProposalMessage({
        amount_ars: r.parsed_amount_ars,
        categoryName: catDispRows[0]?.name ?? r.parsed_category_slug ?? "sin categoría",
        categoryEmoji: catDispRows[0]?.emoji ?? "📦",
        merchant: newMerchant,
        date: r.parsed_date ?? getArgentinaDate().toISOString().slice(0, 10),
        source: "edit",
      });
    }

    // ── Expense edit handlers (voice/NL flow) ────────────────────────
    if (editState?.step === "expense_edit_amount") {
      const ed = editState.data as {
        category_id: string;
        category_name: string;
        category_emoji: string;
        amount_ars: number;
        merchant?: string;
        group_id: string;
        user_id: string;
        is_exception: boolean;
        requires_reimbursement?: boolean;
      };
      
      const newAmount = parseFloat(text.replace(/[$\s.]/g, "").replace(",", ".").trim());
      if (isNaN(newAmount) || newAmount <= 0) {
        return { text: "❌ Monto inválido. Enviá solo el número, ej: <code>47000</code>" };
      }

      const { setConversationState } = await import("./splits/conversation-state");
      const updatedData = { ...ed, amount_ars: newAmount };
      await setConversationState(chatId, String(msg.from.id), {
        step: "expense_confirm",
        data: { ...updatedData, step: "expense_confirm" },
      });

      return buildExpenseEditedMessage(updatedData);
    }

    if (editState?.step === "expense_edit_merchant") {
      const ed = editState.data as {
        category_id: string;
        category_name: string;
        category_emoji: string;
        amount_ars: number;
        merchant?: string;
        group_id: string;
        user_id: string;
        is_exception: boolean;
        requires_reimbursement?: boolean;
      };
      
      const newMerchant = text.trim().slice(0, 100);
      const { setConversationState } = await import("./splits/conversation-state");
      const updatedData = { ...ed, merchant: newMerchant };
      await setConversationState(chatId, String(msg.from.id), {
        step: "expense_confirm",
        data: { ...updatedData, step: "expense_confirm" },
      });

      return buildExpenseEditedMessage(updatedData);
    }

    // ── Expense pending amount (when user said category but no amount) ────────
    if (editState?.step === "expense_pending_amount") {
      const ed = editState.data as {
        category_id: string;
        category_name: string;
        category_emoji: string;
        merchant?: string;
        group_id: string;
        user_id: string;
        requires_reimbursement?: boolean;
      };
      
      const amount = parseAmountFromText(text);
      if (!amount || amount <= 0) {
        return { 
          text: [
            `❌ No entendí el monto.`,
            ``,
            `Escribí o decí el número, ej:`,
            `• <code>15000</code>`,
            `• <code>15 mil</code>`,
            `• <code>quince mil</code>`,
          ].join("\n"),
        };
      }

      const cat = await db.query.categories.findFirst({
        where: and(eq(categories.id, ed.category_id), eq(categories.group_id, groupId)),
      });
      if (!cat) {
        const { clearConversationState } = await import("./splits/conversation-state");
        await clearConversationState(chatId, String(msg.from.id));
        return { text: "❌ Categoría no encontrada. Volvé a empezar." };
      }

      return buildExpenseOrExceptionMessage(
        chatId,
        String(msg.from.id),
        userId,
        groupId,
        month,
        cat,
        amount,
        ed.merchant,
        ed.requires_reimbursement ?? false
      );
    }

    // ── Recurring expense conversational flow handlers ────────────────────────
    if (editState?.step === "recurring_name") {
      const name = text.trim().slice(0, 50);
      if (!name) {
        return { text: "❌ Nombre inválido. Escribí el nombre del gasto (ej: Netflix, Alquiler):" };
      }

      const { setConversationState } = await import("./splits/conversation-state");
      await setConversationState(chatId, String(msg.from.id), {
        step: "recurring_amount",
        data: { name },
      });

      return {
        text: [
          `✏️ <b>${escapeHtml(name)}</b>`,
          ``,
          `¿Cuál es el monto mensual?`,
          ``,
          `Escribí el monto (ej: 15000):`,
        ].join("\n"),
      };
    }

    if (editState?.step === "recurring_amount") {
      const ed = editState.data as { name: string; category_slug?: string };
      const amount = parseFloat(text.replace(/[$\s.]/g, "").replace(",", ".").trim());
      
      if (isNaN(amount) || amount <= 0) {
        return { text: "❌ Monto inválido. Escribí solo el número, ej: <code>15000</code>" };
      }

      const { setConversationState } = await import("./splits/conversation-state");
      await setConversationState(chatId, String(msg.from.id), {
        step: "recurring_day",
        data: { name: ed.name, amount, category_slug: ed.category_slug },
      });

      return {
        text: [
          `✏️ <b>${escapeHtml(ed.name)}</b>`,
          `💰 $${amount.toLocaleString("es-AR")}`,
          ``,
          `¿Qué día del mes vence?`,
        ].join("\n"),
        replyMarkup: buildPersonalKeyboard([
          [
            { text: "1", callback_data: `recurring:day_select:1` },
            { text: "5", callback_data: `recurring:day_select:5` },
            { text: "10", callback_data: `recurring:day_select:10` },
          ],
          [
            { text: "15", callback_data: `recurring:day_select:15` },
            { text: "20", callback_data: `recurring:day_select:20` },
            { text: "25", callback_data: `recurring:day_select:25` },
          ],
          [
            { text: "28", callback_data: `recurring:day_select:28` },
            { text: "Fin de mes", callback_data: `recurring:day_select:31` },
          ],
          [{ text: "❌ Cancelar", callback_data: "recurring:cancel" }],
        ]),
      };
    }

    if (editState?.step === "recurring_edit_amount") {
      const ed = editState.data as { expense_id: string };
      const newAmount = parseFloat(text.replace(/[$\s.]/g, "").replace(",", ".").trim());
      
      if (isNaN(newAmount) || newAmount <= 0) {
        return { text: "❌ Monto inválido. Escribí solo el número, ej: <code>15000</code>" };
      }

      try {
        // Update amount in DB
        const { recurringExpenses } = await import("@/lib/db/schema");
        await db
          .update(recurringExpenses)
          .set({ amountArs: newAmount, updatedAt: Date.now() })
          .where(eq(recurringExpenses.id, ed.expense_id));

        // Clear conversation state
        const { clearConversationState } = await import("./splits/conversation-state");
        await clearConversationState(chatId, String(msg.from.id));

        return {
          text: `✅ Monto actualizado a <b>$${newAmount.toLocaleString("es-AR")}</b>/mes.`,
          replyMarkup: buildPersonalKeyboard([
            [{ text: "⚙️ Gestionar", callback_data: "recurring:manage" }],
            [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
          ]),
        };
      } catch (err) {
        console.error("Failed to update recurring expense amount:", err);
        return { text: "❌ Error al guardar. Intentá nuevamente." };
      }
    }
  }

  if (text.startsWith("/gasto")) {
    const parts = text.split(" ").filter(p => p.length > 0);
    if (parts.length < 3) {
      return { text: "Uso: /gasto monto categoria descripcion\nEjemplo: /gasto 47000 supermercado Cordiez" };
    }

    // Flexible parsing: detect amount and category regardless of order
    let amount_ars: number | null = null;
    let slugCandidate: string | null = null;
    let merchantParts: string[] = [];
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      // Try to parse as number (remove dots as thousands separator, replace comma with dot)
      const numStr = part.replace(/\./g, "").replace(",", ".");
      const num = parseFloat(numStr);
      
      if (!isNaN(num) && num > 0 && amount_ars === null) {
        amount_ars = num;
      } else if (slugCandidate === null) {
        // Normalize: remove accents and convert to lowercase
        slugCandidate = part.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
          .replace(/\s+/g, "_");
      } else {
        merchantParts.push(part);
      }
    }

    if (amount_ars === null || amount_ars <= 0) {
      return { text: "Monto inválido. Usá un número positivo, ej: /gasto 47000 supermercado" };
    }
    
    if (!slugCandidate) {
      return { text: "Falta la categoría. Ej: /gasto 47000 supermercado" };
    }

    const slug = slugCandidate;
    const merchant = merchantParts.join(" ") || undefined;

    // Try exact match first, then fuzzy match
    let cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, slug), eq(categories.group_id, groupId)),
    });
    
    // Fuzzy match if exact fails
    if (!cat) {
      const allCats = await db.select().from(categories).where(eq(categories.group_id, groupId));
      cat = allCats.find(c => {
        const catSlugNorm = c.slug.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const catNameNorm = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return catSlugNorm === slug || catNameNorm === slug || 
               catSlugNorm.includes(slug) || slug.includes(catSlugNorm);
      });
    }
    
    if (!cat) {
      return { text: `Categoría "${slugCandidate}" no encontrada.\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos` };
    }

    const settings = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
    });
    if (!settings) return { text: "Sin configuración mensual. Configurá desde la web." };

    return buildExpenseOrExceptionMessage(
      chatId,
      String(msg.from.id),
      userId,
      groupId,
      month,
      cat,
      amount_ars,
      merchant
    );
  }

  // ── /puedo monto categoria ──
  if (text.startsWith("/puedo")) {
    const parts = text.split(" ");
    if (parts.length < 2) {
      return { text: "Uso: /puedo monto [categoria]\nEjemplo: /puedo 35000 salidas_pareja" };
    }

    const amount_ars = parseFloat(parts[1].replace(",", "."));
    if (isNaN(amount_ars) || amount_ars <= 0) {
      return { text: "Monto inválido. Ej: /puedo 35000 salidas_pareja" };
    }

    const slug = parts[2]?.toLowerCase() ?? null;

    const [summary, breakdown] = await Promise.all([
      getMonthSummary(groupId, month),
      getCategoryBreakdown(groupId, month),
    ]);

    if (!summary) return { text: "Sin configuración mensual. Configurá desde la web." };

    const exchangeRate = summary.exchange_rate || 1;
    const ahorro_usd_before = summary.ahorro_proyectado_usd;
    const total_spent_usd_after = summary.total_spent_usd + (amount_ars / exchangeRate);
    const ahorro_usd_after = summary.income_usd - total_spent_usd_after;

    const newMonthStatus = calculateMonthStatus({
      income_usd: summary.income_usd,
      total_spent_usd: total_spent_usd_after,
      saving_goal_usd: summary.saving_goal_usd,
      saving_goal_yellow: summary.saving_goal_yellow ?? summary.saving_goal_usd * 0.5,
    });

    // If category provided, show category impact
    if (slug) {
      const catData = breakdown.find(c => c.slug === slug || c.name.toLowerCase() === slug.replace(/_/g, " "));
      if (!catData) {
        const list = breakdown.map(c => c.slug).join(", ");
        return { text: `No encontré la categoría "${slug}".\nDisponibles: ${list}` };
      }

      const newGastado = catData.gastado_ars + amount_ars;
      const newCategoryStatus = calculateCategoryStatus({
        gastado_ars: newGastado,
        budget_ars: catData.budget_ars,
      });
      const disponible_after = catData.budget_ars > 0 ? catData.budget_ars - newGastado : null;

      return {
        text: formatPuedo({
          amount_ars,
          category: catData.name,
          emoji: catData.emoji,
          gastado_ars: catData.gastado_ars,
          budget_ars: catData.budget_ars,
          newCategoryStatus,
          disponible_after,
          ahorro_usd_before,
          ahorro_usd_after,
          newMonthStatus,
          saving_goal_usd: summary.saving_goal_usd,
        }),
      };
    }

    // No category — show only savings impact
    const monthIcon = newMonthStatus === "GREEN" ? "🟢" : newMonthStatus === "YELLOW" ? "🟡" : "🔴";
    const decision = newMonthStatus === "RED"
      ? "🔴 <b>Cuidado</b> — este gasto pondría tu ahorro en rojo."
      : newMonthStatus === "YELLOW"
        ? "🟡 <b>Podés, pero con cuidado</b> — estarías ajustado."
        : "🟢 <b>Sí podés</b> — sin comprometer tus metas.";

    return {
      text: [
        `💭 <b>¿Podés gastar ${amount_ars.toLocaleString("es-AR")} ARS?</b>`,
        ``,
        decision,
        ``,
        `<b>💰 Impacto en ahorro:</b>`,
        `Antes: USD ${ahorro_usd_before.toFixed(0)} → Después: USD ${ahorro_usd_after.toFixed(0)} ${monthIcon}`,
        summary.saving_goal_usd > 0
          ? `Meta: USD ${summary.saving_goal_usd.toFixed(0)} (${Math.round((ahorro_usd_after / summary.saving_goal_usd) * 100)}% alcanzado)`
          : "",
        ``,
        `Tip: /puedo ${parts[1]} [categoria] para ver también el impacto en tu presupuesto.`,
      ].filter(l => l !== "").join("\n"),
    };
  }

  // ── Photo / Document → OCR ticket import ────────────────────
  const isPhoto = !!msg.photo?.length;
  const isImageDoc = !!(msg.document?.mime_type?.startsWith("image/"));

  if (isPhoto || isImageDoc) {
    const caption = msg.caption?.trim() ?? "";
    const receiptId = randomUUID();
    
    // Send immediate feedback before slow OCR
    await sendTelegramMessage(chatId, "🔍 <i>Procesando imagen...</i>").catch(() => {});
    
    const fileId = isPhoto
      ? msg.photo![msg.photo!.length - 1]?.file_id
      : msg.document!.file_id;

    // Caption-first: if caption has a number, parse it with NLP (skip OCR)
    if (caption && /\d/.test(caption)) {
      const { parseFinancialMessage } = await import("@/lib/ai/parse-message");
      const parsed = await parseFinancialMessage(caption);

      if (
        (parsed.intent === "register_expense" || parsed.intent === "simulate_expense") &&
        parsed.amount_ars && parsed.amount_ars > 0 &&
        parsed.confidence >= 0.4
      ) {
        const slug = parsed.category?.toLowerCase() ?? null;
        const cat = slug
          ? await db.query.categories.findFirst({
              where: and(eq(categories.slug, slug), eq(categories.group_id, groupId)),
            })
          : null;

        await saveReceiptImport({
          id: receiptId, user_id: userId,
          telegram_file_id: fileId ?? null, caption,
          ocr_raw_text: null,
          parsed_amount_ars: parsed.amount_ars,
          parsed_category_slug: slug,
          parsed_merchant: parsed.merchant ?? null,
          parsed_date: null,
          groq_raw_response: JSON.stringify(parsed),
          status: cat ? "pending" : "failed",
          fail_reason: cat ? null : "category not detected",
        });

        if (!cat) {
          return buildCategoryKeyboard(groupId, parsed.amount_ars, parsed.merchant ?? null, receiptId, chatId, String(msg.from.id));
        }

        // State already persisted in receipt_imports (status=pending) — no in-memory set needed
        return buildReceiptProposalMessage({
          amount_ars: parsed.amount_ars,
          categoryName: cat.name, categoryEmoji: cat.emoji,
          merchant: parsed.merchant ?? undefined,
          date: getArgentinaDate().toISOString().slice(0, 10),
          source: "caption",
        });
      }
    }

    // Run OCR
    let ocrText: string | null = null;
    try {
      const ocrResult = isPhoto
        ? await ocrTelegramPhoto(msg.photo!)
        : await ocrTelegramDocument(msg.document!);
      ocrText = ocrResult?.text ?? null;
    } catch (err) {
      console.error("OCR error:", err instanceof Error ? err.message : String(err));
    }

    if (!ocrText) {
      await saveReceiptImport({
        id: receiptId, user_id: userId,
        telegram_file_id: fileId ?? null, caption: caption || null,
        ocr_raw_text: null, parsed_amount_ars: null,
        parsed_category_slug: null, parsed_merchant: null, parsed_date: null,
        groq_raw_response: null, status: "failed",
        fail_reason: "OCR returned no text",
      });
      return { text: "📷 No pude leer el ticket. Usá /gasto monto categoria descripción." };
    }

    // Parse OCR text with Groq
    let groqResult = null;
    try {
      groqResult = await parseReceiptText(ocrText);
    } catch (err) {
      console.error("Receipt Groq error:", err instanceof Error ? err.message : String(err));
    }

    const amount_ars = groqResult?.amount_ars ?? null;
    const slug = groqResult?.category_slug?.toLowerCase() ?? null;
    const merchant = groqResult?.merchant ?? null;
    const parsedDate = (() => {
      const d = groqResult?.date_text ?? "";
      return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : getArgentinaDate().toISOString().slice(0, 10);
    })();

    const cat = slug
      ? await db.query.categories.findFirst({
          where: and(eq(categories.slug, slug), eq(categories.group_id, groupId)),
        })
      : null;

    await saveReceiptImport({
      id: receiptId, user_id: userId,
      telegram_file_id: fileId ?? null, caption: caption || null,
      ocr_raw_text: ocrText,
      parsed_amount_ars: amount_ars,
      parsed_category_slug: slug,
      parsed_merchant: merchant,
      parsed_date: parsedDate,
      groq_raw_response: groqResult ? JSON.stringify(groqResult) : null,
      status: amount_ars ? "pending" : "failed",
      fail_reason: amount_ars ? null : "Groq could not extract amount",
    });

    if (!amount_ars) {
      return {
        text: [
          `📷 <b>Texto del ticket (OCR):</b>`,
          `<code>${escapeHtml(ocrText.slice(0, 400))}</code>`,
          ``,
          `No pude detectar el monto. Usá /gasto monto categoria descripción.`,
        ].join("\n"),
      };
    }

    if (!cat) {
      // No category detected — show category selection buttons
      return buildCategoryKeyboard(groupId, amount_ars, merchant, receiptId, chatId, String(msg.from.id));
    }

    // State already persisted in receipt_imports (status=pending)
    return buildReceiptProposalMessage({
      amount_ars,
      categoryName: cat.name, categoryEmoji: cat.emoji,
      merchant: merchant ?? undefined,
      date: parsedDate,
      source: "ocr",
    });
  }

  if (text.startsWith("/vincular")) {
    const parts = text.split(" ");
    const code = parts[1]?.trim();
    if (!code) return { text: "Uso: /vincular XXXXXX\nGenerá tu código en el dashboard → Configuración." };

    const telegramUserId = String(msg.from.id);

    const linkCode = await db.query.telegram_link_codes.findFirst({
      where: and(
        eq(telegram_link_codes.id, code),
        eq(telegram_link_codes.used, 0),
        gt(telegram_link_codes.expires_at, Date.now()),
      ),
    });

    if (!linkCode) {
      return { text: "❌ Código inválido o expirado. Generá uno nuevo desde el dashboard → Configuración → Conectar Telegram." };
    }

    // Check if this Telegram account is already linked to another user
    const existingLink = await db.query.users.findFirst({
      where: eq(users.telegram_user_id, telegramUserId),
    });
    if (existingLink && existingLink.id !== linkCode.user_id) {
      return { text: "⚠️ Este Telegram ya está vinculado a otra cuenta. Desvinculá desde la web primero." };
    }

    await db.update(users).set({ telegram_user_id: telegramUserId }).where(eq(users.id, linkCode.user_id));
    await db.update(telegram_link_codes).set({ used: 1 }).where(eq(telegram_link_codes.id, code));

    return { text: "✅ ¡Cuenta vinculada correctamente! Ya podés usar el bot con tu usuario." };
  }

  if (text === "/grupos") {
    const { getUserGroups } = await import("@/lib/groups/permissions");
    const myGroups = await getUserGroups(userId);
    if (myGroups.length === 0) return { text: "No pertenecés a ningún grupo." };
    const currentGroup = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
    const lines = myGroups.map(g => {
      const active = g.group.id === groupId ? " ✓ *activo*" : "";
      const role = g.role === "owner" ? "owner" : g.role === "admin" ? "admin" : "miembro";
      return `• ${g.group.name} (${role})${active}`;
    }).join("\n");
    return { text: `📋 *Tus grupos:*\n${lines}\n\nPara cambiar: /grupo NombreDelGrupo` };
  }

  if (text.startsWith("/grupo")) {
    const groupName = text.replace("/grupo", "").trim();

    if (!groupName) {
      // Show current active group
      const currentGroup = await db.query.groups.findFirst({
        where: eq(groups.id, groupId),
      });
      return { text: `📁 Grupo activo: *${currentGroup?.name ?? "desconocido"}*\n\nPara cambiar: /grupo NombreDelGrupo` };
    }

    // Find group by name among user's groups
    const { getUserGroups } = await import("@/lib/groups/permissions");
    const myGroups = await getUserGroups(userId);
    const target = myGroups.find(g => g.group.name.toLowerCase() === groupName.toLowerCase());

    if (!target) {
      const names = myGroups.map(g => `• ${g.group.name}`).join("\n");
      return { text: `❌ No encontré un grupo con ese nombre.\n\nTus grupos:\n${names}` };
    }

    await db.update(users).set({ active_telegram_group_id: target.group.id }).where(eq(users.id, userId));
    return { text: `✅ Grupo activo cambiado a *${target.group.name}*` };
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return { text: "Por ahora usá el formato: /gasto monto categoria descripción" };
  }

  const { parseFinancialMessage } = await import("@/lib/ai/parse-message");
  const parsed = await parseFinancialMessage(text);

  // ── Fallback: detect expense patterns WITHOUT amount for conversational flow ──
  if ((parsed.intent === "unknown" || parsed.confidence < 0.4)) {
    // Category keyword mapping
    const categoryKeywords: Record<string, string[]> = {
      supermercado: ["super", "súper", "supermercado", "mercado"],
      verduleria: ["verdulería", "verduleria", "verdura", "verduras"],
      restaurante: ["restaurante", "restaurant", "resto", "comida"],
      servicios: ["servicios", "servicio", "luz", "gas", "agua", "internet"],
      movilidad: ["movilidad", "transporte", "uber", "taxi", "colectivo", "nafta"],
      tarjeta: ["tarjeta", "tarjetas", "credito", "crédito"],
      salidas_pareja: ["salida", "salidas", "pareja", "cita"],
      viaje: ["viaje", "viajes", "vacaciones"],
      compras_personales: ["compras", "personal", "personales", "ropa"],
      imprevistos: ["imprevisto", "imprevistos", "emergencia"],
    };
    
    // Pattern: "gasto de X", "gasté en X", "un gasto de X", "gasto X", "gasto es X" (voice transcription)
    // Note: "es" is added because voice transcription often mishears "de" as "es"
    // Note: "gato" is added because voice transcription often mishears "gasto" as "gato"
    // Note: Using [^\s.,!?]+ instead of \w+ to match accented characters (súper, verdulería, etc.)
    const expensePatterns = [
      /(?:gasto|gasté|gastar|gato)\s+(?:de\s+|en\s+|es\s+)?([^\s.,!?"]+)/i,
      /(?:un\s+)?(?:gasto|gato)\s+(?:de\s+|en\s+|es\s+)?([^\s.,!?"]+)/i,
      /([^\s.,!?"]+)\s+(?:gasto|gasté|gato)/i,
    ];
    
    let detectedCategory: string | null = null;
    let detectedSlug: string | null = null;
    
    for (const pattern of expensePatterns) {
      const match = text.match(pattern);
      if (match) {
        const keyword = match[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // Skip very short keywords that could cause false matches (e.g., "es" matching "restaurante")
        if (keyword.length < 3) continue;
        
        for (const [slug, keywords] of Object.entries(categoryKeywords)) {
          const normalizedKeywords = keywords.map(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
          if (normalizedKeywords.some(k => k.includes(keyword) || keyword.includes(k))) {
            detectedSlug = slug;
            detectedCategory = slug;
            break;
          }
        }
        if (detectedCategory) break;
      }
    }
    
    // If we detected a category but no amount, start conversational flow
    if (detectedSlug) {
      const cat = await db.query.categories.findFirst({
        where: and(eq(categories.slug, detectedSlug), eq(categories.group_id, groupId)),
      });
      
      if (cat) {
        const { setConversationState } = await import("./splits/conversation-state");
        await setConversationState(chatId, String(msg.from.id), {
          step: "expense_pending_amount",
          data: {
            category_id: cat.id,
            category_name: cat.name,
            category_emoji: cat.emoji ?? "📦",
            merchant: undefined,
            group_id: groupId,
            user_id: userId,
            requires_reimbursement: false,
          },
        });
        
        return {
          text: [
            `${cat.emoji ?? "📦"} <b>${cat.name}</b>`,
            ``,
            `¿Cuánto gastaste?`,
            ``,
            `Escribí el monto (ej: <code>15000</code>):`,
          ].join("\n"),
        };
      }
    }
  }

  // Fallback: detect recurring expense pattern with regex if AI missed it
  if ((parsed.intent === "unknown" || parsed.confidence < 0.4) && /recurrente/i.test(text)) {
    // Pattern: "agregar recurrente NOMBRE MONTO [día X]"
    const recurringMatch = text.match(/recurrente\s+([a-zA-Z0-9+\-_áéíóúñÁÉÍÓÚÑ]+)\s+(\d+(?:[.,]\d+)?)/i);
    const dayMatch = text.match(/d[ií]a\s*(\d{1,2})|el\s+(\d{1,2})/i);
    
    if (recurringMatch) {
      const name = recurringMatch[1];
      const amount = parseFloat(recurringMatch[2].replace(",", "."));
      const day = dayMatch ? parseInt(dayMatch[1] || dayMatch[2]) : null;
      const suggestion = findSuggestionByName(name);
      
      // Override parsed with our regex extraction
      parsed.intent = "add_recurring";
      parsed.recurring_name = name;
      parsed.amount_ars = amount;
      parsed.recurring_day = day;
      parsed.category = suggestion?.category ?? null;
      parsed.confidence = 0.85;
    }
  }

  if (parsed.intent === "unknown" || parsed.confidence < 0.4) {
    return { text: "No entendí el mensaje. Podés usar:\n/gasto monto categoria descripcion\n/puedo monto [categoria]\n/resumen\n/disponible categoria\n/reintegros\n/borrar_ultimo" };
  }

  // ── query_summary → /resumen ──
  if (parsed.intent === "query_summary") {
    const summary = await getMonthSummary(groupId, month);
    if (!summary) return { text: "No hay configuración para este mes. Configurá desde la web." };
    return { text: formatResumen({ month, ...summary }) };
  }

  // ── delete_last → /borrar_ultimo ──
  if (parsed.intent === "delete_last") {
    const last = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.group_id, groupId),
        eq(transactions.month, month),
        eq(transactions.status, "active")
      ),
      orderBy: (t, { desc }) => desc(t.created_at),
    });
    if (!last) return { text: "No hay transacciones activas para borrar." };
    await db.update(transactions)
      .set({ status: "deleted", deleted_at: Date.now() })
      .where(and(eq(transactions.id, last.id), eq(transactions.group_id, groupId)));
    return { text: `✅ Eliminado: $${last.amount_ars.toLocaleString("es-AR")} del ${last.date}` };
  }

  // ── query_available → /disponible ──
  if (parsed.intent === "query_available") {
    const slug = parsed.category?.toLowerCase() ?? null;
    if (!slug) {
      // No specific category — show all
      const breakdown = await getCategoryBreakdown(groupId, month);
      const lines = breakdown
        .filter(c => c.budget_ars > 0)
        .map(c => {
          const icon = c.status === "OK" ? "🟢" : c.status === "WARNING" ? "🟡" : "🔴";
          const disp = c.disponible_ars !== null ? `$${c.disponible_ars.toLocaleString("es-AR")} disponible` : "sin límite";
          return `${icon} ${c.emoji} ${c.name}: ${disp}`;
        });
      return {
        text: lines.length > 0
          ? `<b>💰 Disponible este mes:</b>\n\n${lines.join("\n")}`
          : "Sin presupuestos configurados.",
      };
    }

    // Exact slug match first
    let cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, slug), eq(categories.group_id, groupId)),
    });

    // Fuzzy match if exact fails
    if (!cat) {
      const allCats = await db.query.categories.findMany({ where: eq(categories.group_id, groupId) });
      const inputWords = slug.split(/[\s_]+/).filter(Boolean);
      cat = allCats.find(c =>
        inputWords.every(w => c.slug.includes(w)) ||
        inputWords.every(w => c.name.toLowerCase().includes(w))
      ) ?? undefined;
    }

    if (!cat) return { text: `No encontré la categoría "${slug}".\n\nUsá /disponible para ver todas las categorías disponibles.` };
    const breakdown = await getCategoryBreakdown(groupId, month);
    const catData = breakdown.find(c => c.id === cat!.id);
    if (!catData) return { text: `Sin datos para ${cat.name} este mes.` };
    return {
      text: formatDisponible({
        category: catData.name,
        emoji: catData.emoji,
        budget_ars: catData.budget_ars,
        gastado_ars: catData.gastado_ars,
        disponible_ars: catData.disponible_ars,
        status: catData.status,
      }),
    };
  }

  // ── simulate_expense → lógica de /puedo ──
  if (parsed.intent === "simulate_expense") {
    const amount_ars = parsed.amount_ars ?? null;
    if (!amount_ars || amount_ars <= 0) {
      return { text: "Entendí que querés saber si podés gastar algo, pero no detecté el monto. Ej: \"puedo gastar 36000 en restaurante\"" };
    }
    const slug = parsed.category?.toLowerCase() ?? null;
    const [summary, breakdown] = await Promise.all([
      getMonthSummary(groupId, month),
      getCategoryBreakdown(groupId, month),
    ]);
    if (!summary) return { text: "Sin configuración mensual. Configurá desde la web." };
    const exchangeRate = summary.exchange_rate || 1;
    const ahorro_usd_before = summary.ahorro_proyectado_usd;
    const total_spent_usd_after = summary.total_spent_usd + (amount_ars / exchangeRate);
    const ahorro_usd_after = summary.income_usd - total_spent_usd_after;
    const newMonthStatus = calculateMonthStatus({
      income_usd: summary.income_usd,
      total_spent_usd: total_spent_usd_after,
      saving_goal_usd: summary.saving_goal_usd,
      saving_goal_yellow: summary.saving_goal_yellow ?? summary.saving_goal_usd * 0.5,
    });
    if (slug) {
      const catData = breakdown.find(c => c.slug === slug || c.name.toLowerCase() === slug.replace(/_/g, " "));
      if (!catData) {
        const list = breakdown.map(c => c.slug).join(", ");
        return { text: `No encontré la categoría "${slug}".\nDisponibles: ${list}` };
      }
      const newGastado = catData.gastado_ars + amount_ars;
      const newCategoryStatus = calculateCategoryStatus({ gastado_ars: newGastado, budget_ars: catData.budget_ars });
      const disponible_after = catData.budget_ars > 0 ? catData.budget_ars - newGastado : null;
      return {
        text: formatPuedo({
          amount_ars, category: catData.name, emoji: catData.emoji,
          gastado_ars: catData.gastado_ars, budget_ars: catData.budget_ars,
          newCategoryStatus, disponible_after,
          ahorro_usd_before, ahorro_usd_after, newMonthStatus,
          saving_goal_usd: summary.saving_goal_usd,
        }),
      };
    }
    const monthIcon = newMonthStatus === "GREEN" ? "🟢" : newMonthStatus === "YELLOW" ? "🟡" : "🔴";
    const decision = newMonthStatus === "RED"
      ? "🔴 <b>Cuidado</b> — este gasto pondría tu ahorro en rojo."
      : newMonthStatus === "YELLOW"
        ? "🟡 <b>Podés, pero con cuidado</b> — estarías ajustado."
        : "🟢 <b>Sí podés</b> — sin comprometer tus metas.";
    return {
      text: [
        `💭 <b>¿Podés gastar ${amount_ars.toLocaleString("es-AR")} ARS?</b>`,
        ``,
        decision,
        ``,
        `<b>💰 Impacto en ahorro:</b>`,
        `Antes: USD ${ahorro_usd_before.toFixed(0)} → Después: USD ${ahorro_usd_after.toFixed(0)} ${monthIcon}`,
        summary.saving_goal_usd > 0
          ? `Meta: USD ${summary.saving_goal_usd.toFixed(0)} (${Math.round((ahorro_usd_after / summary.saving_goal_usd) * 100)}% alcanzado)`
          : "",
      ].filter(l => l !== "").join("\n"),
    };
  }

  // ── register_expense → lógica de /gasto ──
  if (parsed.intent === "register_expense") {
    const amount_ars = parsed.amount_ars ?? null;
    const slug = parsed.category?.toLowerCase() ?? null;

    if (!amount_ars || amount_ars <= 0) {
      // If we detected a category but no amount, start conversational flow
      if (slug) {
        // Normalize slug: remove accents
        const normalizedSlug = slug.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // Try exact match first
        let cat = await db.query.categories.findFirst({
          where: and(eq(categories.slug, normalizedSlug), eq(categories.group_id, groupId)),
        });
        
        // Fuzzy match if exact fails
        if (!cat) {
          const allCats = await db.select().from(categories).where(eq(categories.group_id, groupId));
          const fuzzyMatch = allCats.find(c => {
            const catSlugNorm = c.slug.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const catNameNorm = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return catSlugNorm === normalizedSlug || catNameNorm === normalizedSlug || 
                   catSlugNorm.includes(normalizedSlug) || normalizedSlug.includes(catSlugNorm);
          });
          if (fuzzyMatch) cat = fuzzyMatch;
        }
        
        if (cat) {
          const { setConversationState } = await import("./splits/conversation-state");
          await setConversationState(chatId, String(msg.from.id), {
            step: "expense_pending_amount",
            data: {
              category_id: cat.id,
              category_name: cat.name,
              category_emoji: cat.emoji ?? "📦",
              merchant: parsed.merchant ?? parsed.description ?? undefined,
              group_id: groupId,
              user_id: userId,
              requires_reimbursement: parsed.requires_reimbursement ?? false,
            },
          });
          
          return {
            text: [
              `${cat.emoji ?? "📦"} <b>${cat.name}</b>`,
              ``,
              `¿Cuánto gastaste?`,
              ``,
              `Escribí el monto (ej: <code>15000</code>):`,
            ].join("\n"),
          };
        }
      }
      
      // No category detected either - friendly message
      return { 
        text: [
          "🤔 Detecté que querés registrar un gasto pero me falta el monto.",
          "",
          "Ejemplos:",
          "• <code>Gasté 15000 en supermercado</code>",
          "• <code>47000 verdulería</code>",
          "• <code>Súper 13000</code>",
        ].join("\n"),
      };
    }
    if (!slug) {
      // Show category selection buttons instead of plain text
      return await buildExpenseCategoryKeyboard(
        groupId,
        amount_ars,
        parsed.merchant ?? parsed.description ?? null,
        chatId,
        String(msg.from.id),
        userId,
        parsed.requires_reimbursement ?? false,
      );
    }

    // Normalize slug: remove accents
    const normalizedSlug = slug.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Try exact match first
    let cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, normalizedSlug), eq(categories.group_id, groupId)),
    });
    
    // Fuzzy match if exact fails
    if (!cat) {
      const allCats = await db.select().from(categories).where(eq(categories.group_id, groupId));
      cat = allCats.find(c => {
        const catSlugNorm = c.slug.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const catNameNorm = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return catSlugNorm === normalizedSlug || catNameNorm === normalizedSlug || 
               catSlugNorm.includes(normalizedSlug) || normalizedSlug.includes(catSlugNorm);
      });
    }
    
    if (!cat) {
      // Try conversational flow - ask for category with buttons
      return await buildExpenseCategoryKeyboard(
        groupId,
        amount_ars,
        parsed.merchant ?? parsed.description ?? null,
        chatId,
        String(msg.from.id),
        userId,
        parsed.requires_reimbursement ?? false,
      );
    }

    const merchant = parsed.merchant ?? parsed.description ?? undefined;

    return buildExpenseOrExceptionMessage(
      chatId,
      String(msg.from.id),
      userId,
      groupId,
      month,
      cat,
      amount_ars,
      merchant,
      parsed.requires_reimbursement ?? false
    );
  }

  // ── query_reimbursements → /reintegros ──
  if (parsed.intent === "query_reimbursements") {
    const [reimbursements, openGroupReimbursements] = await Promise.all([
      getReimbursementsByUser(userId),
      getOpenGroupReimbursements(groupId, userId),
    ]);
    return buildReimbursementsMessage(reimbursements, openGroupReimbursements, userId);
  }

  // ── add_recurring → agregar gasto recurrente ──
  if (parsed.intent === "add_recurring") {
    const amount_ars = parsed.amount_ars ?? null;
    const name = parsed.recurring_name ?? parsed.merchant ?? parsed.description ?? null;
    const dayOfMonth = parsed.recurring_day ?? null;

    if (!name) {
      return {
        text: "Entendí que querés agregar un gasto recurrente pero no detecté el nombre. Ej: \"agregar recurrente 5000 netflix\"",
      };
    }

    if (!amount_ars || amount_ars <= 0) {
      // Try to get suggested amount
      const suggestion = findSuggestionByName(name);
      if (suggestion?.suggestedAmount) {
        return {
          text: `📅 <b>Agregar gasto recurrente</b>\n\n¿Cuánto es el monto mensual de <b>${escapeHtml(name)}</b>?\n\nSugerido: $${suggestion.suggestedAmount.toLocaleString("es-AR")}`,
          replyMarkup: buildPersonalKeyboard([
            [{ text: `✅ $${suggestion.suggestedAmount.toLocaleString("es-AR")}`, callback_data: `recurring:add_confirm:${name}:${suggestion.suggestedAmount}:${suggestion.category}` }],
            [{ text: "✏️ Otro monto", callback_data: `recurring:add_amount:${name}` }],
            [{ text: "❌ Cancelar", callback_data: "recurring:cancel" }],
          ]),
        };
      }
      return {
        text: `Entendí que querés agregar "${name}" como recurrente pero no detecté el monto. Ej: \"agregar recurrente 5000 ${name}\"`,
      };
    }

    // Get category from suggestion or parsed
    const suggestion = findSuggestionByName(name);
    const categorySlug = parsed.category ?? suggestion?.category ?? null;
    
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

    // If day is provided, create directly
    if (dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31) {
      const created = await createRecurringExpense({
        userId,
        groupId,
        name,
        amountArs: amount_ars,
        categoryId,
        merchant: name,
        frequency: "monthly",
        dayOfMonth,
        autoConfirm: false,
      });

      return {
        text: [
          `✅ <b>Gasto recurrente creado</b>`,
          ``,
          `📅 <b>Nombre:</b> ${escapeHtml(created.name)}`,
          `💰 <b>Monto:</b> $${created.amountArs.toLocaleString("es-AR")} ARS`,
          `📂 <b>Categoría:</b> ${categoryEmoji} ${categoryName}`,
          `🔄 <b>Frecuencia:</b> Mensual (día ${created.dayOfMonth})`,
          ``,
          `Te recordaré este gasto el día ${created.dayOfMonth} de cada mes.`,
        ].join("\n"),
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }],
          [{ text: "➕ Agregar otro", callback_data: "recurring:suggest" }],
        ]),
      };
    }

    // No day provided, ask with buttons
    return {
      text: [
        `➕ <b>Agregar ${escapeHtml(name)}</b>`,
        ``,
        `💰 Monto: $${amount_ars.toLocaleString("es-AR")}`,
        `📂 Categoría: ${categoryEmoji} ${categoryName}`,
        ``,
        `¿Qué día del mes vence este gasto?`,
      ].join("\n"),
      replyMarkup: buildPersonalKeyboard([
        [
          { text: "1", callback_data: `recurring:add_final:${name}:${amount_ars}:${categorySlug}:1` },
          { text: "5", callback_data: `recurring:add_final:${name}:${amount_ars}:${categorySlug}:5` },
          { text: "10", callback_data: `recurring:add_final:${name}:${amount_ars}:${categorySlug}:10` },
        ],
        [
          { text: "15", callback_data: `recurring:add_final:${name}:${amount_ars}:${categorySlug}:15` },
          { text: "20", callback_data: `recurring:add_final:${name}:${amount_ars}:${categorySlug}:20` },
          { text: "25", callback_data: `recurring:add_final:${name}:${amount_ars}:${categorySlug}:25` },
        ],
        [
          { text: "28", callback_data: `recurring:add_final:${name}:${amount_ars}:${categorySlug}:28` },
          { text: "Fin de mes", callback_data: `recurring:add_final:${name}:${amount_ars}:${categorySlug}:31` },
        ],
        [{ text: "❌ Cancelar", callback_data: "recurring:cancel" }],
      ]),
    };
  }

  // ── list_recurring → ver gastos recurrentes ──
  if (parsed.intent === "list_recurring") {
    return await buildRecurringListMessage(userId, groupId);
  }

  // ── toggle_recurring → pausar/activar recurrente ──
  if (parsed.intent === "toggle_recurring") {
    const name = parsed.recurring_name ?? null;
    if (!name) {
      return { text: "¿Cuál gasto recurrente querés pausar/activar? Ej: \"pausar netflix\"" };
    }

    const recurring = await findRecurringByName(userId, name);
    if (!recurring) {
      return {
        text: `No encontré un gasto recurrente llamado "${name}". Usá /recurrentes para ver la lista.`,
        replyMarkup: buildPersonalKeyboard([[{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }]]),
      };
    }

    const toggled = await toggleRecurringExpense(recurring.id);
    if (!toggled) {
      return { text: "Error al cambiar el estado del gasto recurrente." };
    }

    const emoji = toggled.category?.emoji ?? "📦";
    const status = toggled.isActive ? "✅ Activado" : "⏸️ Pausado";

    return {
      text: [
        `${status}`,
        ``,
        `${emoji} <b>${escapeHtml(toggled.name)}</b> - $${toggled.amountArs.toLocaleString("es-AR")}`,
        ``,
        toggled.isActive
          ? "Se incluirá en los gastos del próximo mes."
          : "No se generará hasta que lo actives de nuevo.",
      ].join("\n"),
      replyMarkup: buildPersonalKeyboard([[{ text: "📋 Ver recurrentes", callback_data: "recurring:list" }]]),
    };
  }

  // ── pending_recurring → ver pendientes del mes ──
  if (parsed.intent === "pending_recurring") {
    return await buildPendingRecurringMessage(userId);
  }

  // ── confirm_recurring → confirmar pago recurrente ──
  if (parsed.intent === "confirm_recurring") {
    const name = parsed.recurring_name ?? null;
    if (!name) {
      return { text: "¿Cuál gasto recurrente querés confirmar? Ej: \"confirmar netflix\"" };
    }

    const pending = await getPendingExecutions(userId);
    const exec = pending.find(
      (e) =>
        e.recurringExpense.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(e.recurringExpense.name.toLowerCase())
    );

    if (!exec) {
      return {
        text: `No encontré "${name}" en tus pendientes de este mes.`,
        replyMarkup: buildPersonalKeyboard([[{ text: "📋 Ver pendientes", callback_data: "recurring:pending" }]]),
      };
    }

    const result = await confirmExecution(exec.id);
    if (!result.success) {
      return { text: `Error: ${result.error}` };
    }

    const emoji = exec.recurringExpense.category?.emoji ?? "📦";
    const amount = exec.amountArs ?? exec.recurringExpense.amountArs;

    return {
      text: [
        `✅ <b>Gasto registrado</b>`,
        ``,
        `${emoji} <b>${escapeHtml(exec.recurringExpense.name)}</b>`,
        `💰 $${amount.toLocaleString("es-AR")} ARS`,
        ``,
        `Se creó la transacción correspondiente.`,
      ].join("\n"),
      replyMarkup: buildPersonalKeyboard([
        [{ text: "📋 Ver pendientes", callback_data: "recurring:pending" }],
        [{ text: "📊 Resumen", callback_data: "summary" }],
      ]),
    };
  }

  // ── skip_recurring → saltar recurrente este mes ──
  if (parsed.intent === "skip_recurring") {
    const name = parsed.recurring_name ?? null;
    if (!name) {
      return { text: "¿Cuál gasto recurrente querés saltar este mes? Ej: \"saltar netflix este mes\"" };
    }

    const pending = await getPendingExecutions(userId);
    const exec = pending.find(
      (e) =>
        e.recurringExpense.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(e.recurringExpense.name.toLowerCase())
    );

    if (!exec) {
      return {
        text: `No encontré "${name}" en tus pendientes de este mes.`,
        replyMarkup: buildPersonalKeyboard([[{ text: "📋 Ver pendientes", callback_data: "recurring:pending" }]]),
      };
    }

    const result = await skipExecution(exec.id);
    if (!result.success) {
      return { text: `Error: ${result.error}` };
    }

    const emoji = exec.recurringExpense.category?.emoji ?? "📦";

    return {
      text: [
        `⏭️ <b>Gasto saltado</b>`,
        ``,
        `${emoji} <b>${escapeHtml(exec.recurringExpense.name)}</b> no se registrará este mes.`,
      ].join("\n"),
      replyMarkup: buildPersonalKeyboard([
        [{ text: "📋 Ver pendientes", callback_data: "recurring:pending" }],
      ]),
    };
  }

  return { text: "No entendí el mensaje. Podés usar:\n/gasto monto categoria\n/resumen\n/disponible categoria\n/puedo monto [categoria]\n/reintegros\n/recurrentes" };
}

async function registerTransaction(
  userId: string,
  groupId: string,
  category_id: string,
  amount_ars: number,
  merchant: string | undefined,
  month: string,
  is_exception: boolean
): Promise<{ message: string; transactionId: string }> {
  merchant = merchant ? escapeHtml(merchant) : undefined;
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
  });
  if (!settings) return { message: "Sin configuración mensual.", transactionId: "" };

  const amount_usd = parseFloat((amount_ars / settings.exchange_rate).toFixed(2));
  const date = getArgentinaDate().toISOString().slice(0, 10);
  const txId = randomUUID();

  await db.insert(transactions).values({
    id: txId,
    user_id: userId,
    group_id: groupId,
    category_id,
    amount_ars,
    amount_usd,
    merchant: merchant ?? null,
    description: null,
    date,
    month,
    source: "telegram",
    status: "active",
    is_exception: is_exception ? 1 : 0,
  });

  const budget = await db.query.budgets.findFirst({
    where: and(eq(budgets.group_id, groupId), eq(budgets.month, month), eq(budgets.category_id, category_id)),
  });

  const spentRows = await db
    .select({ total: sum(transactions.amount_ars) })
    .from(transactions)
    .where(and(
      eq(transactions.group_id, groupId),
      eq(transactions.month, month),
      eq(transactions.category_id, category_id),
      eq(transactions.status, "active")
    ));
  const gastado_ars = Number(spentRows[0]?.total ?? 0);
  const budget_ars = budget?.budget_ars ?? 0;
  const disponible_ars = budget_ars > 0 ? Math.max(0, budget_ars - gastado_ars) : null;
  const status = calculateCategoryStatus({ gastado_ars, budget_ars });

  const cat = await db.query.categories.findFirst({
    where: eq(categories.id, category_id),
  });

  const summary = await getMonthSummary(groupId, month);

  return {
    message: formatTransactionConfirm({
      amount_ars,
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

/** Formats the receipt proposal message shown to the user */
export function buildReceiptProposalMessage({
  amount_ars,
  categoryName,
  categoryEmoji,
  merchant,
  date,
  source,
}: {
  amount_ars: number;
  categoryName: string;
  categoryEmoji: string;
  merchant?: string;
  date: string;
  source: "ocr" | "caption" | "edit";
}): PersonalBotMessage {
  const sourceLabel = source === "caption" ? "📝 caption" : source === "edit" ? "✏️ editado" : "🔍 OCR";
  const text = [
    `🧾 <b>Ticket detectado</b> (${sourceLabel})`,
    ``,
    `💰 <b>Monto:</b> $${amount_ars.toLocaleString("es-AR")} ARS`,
    `📂 <b>Categoría:</b> ${categoryEmoji} ${categoryName}`,
    merchant ? `🏪 <b>Comercio:</b> ${escapeHtml(merchant)}` : "",
    `📅 <b>Fecha:</b> ${date}`,
    ``,
    `¿Todo bien?`,
  ].filter(Boolean).join("\n");

  return {
    text,
    replyMarkup: buildPersonalKeyboard([
      [{ text: "✅ Confirmar", callback_data: "receipt:confirm" }],
      [
        { text: "💰 Editar monto", callback_data: "receipt:edit_amount" },
        { text: "📂 Editar categoría", callback_data: "receipt:edit_category" },
      ],
      [
        { text: "🏪 Editar comercio", callback_data: "receipt:edit_merchant" },
        { text: "❌ Cancelar", callback_data: "receipt:cancel" },
      ],
    ]),
  };
}

/** Builds a category selection keyboard for when OCR can't detect category */
async function buildCategoryKeyboard(
  groupId: string,
  amount_ars: number,
  merchant: string | null,
  importId: string,
  chatId: string,
  telegramUserId: string,
): Promise<PersonalBotMessage> {
  await setConversationState(chatId, telegramUserId, {
    step: "receipt_select_category",
    data: { import_id: importId },
  });

  const cats = await db.select().from(categories).where(eq(categories.group_id, groupId));

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
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
    rows.push(row);
  }
  rows.push([{ text: "❌ Cancelar", callback_data: "receipt:cancel" }]);

  const text = [
    `🧾 <b>Ticket detectado</b> (🔍 OCR)`,
    ``,
    `💰 <b>Monto:</b> $${amount_ars.toLocaleString("es-AR")} ARS`,
    merchant ? `🏪 <b>Comercio:</b> ${escapeHtml(merchant)}` : "",
    ``,
    `📂 <b>¿Qué categoría es?</b>`,
  ].filter(Boolean).join("\n");

  return { text, replyMarkup: buildPersonalKeyboard(rows) };
}

/** Saves a receipt_imports row, swallowing errors to never break the webhook */
async function saveReceiptImport(data: {
  id: string;
  user_id: string;
  telegram_file_id: string | null;
  caption: string | null;
  ocr_raw_text: string | null;
  parsed_amount_ars: number | null;
  parsed_category_slug: string | null;
  parsed_merchant: string | null;
  parsed_date: string | null;
  groq_raw_response: string | null;
  status: string;
  fail_reason?: string | null;
}): Promise<void> {
  try {
    await db.insert(receipt_imports).values({
      ...data,
      fail_reason: data.fail_reason ?? null,
    });
  } catch (err) {
    console.error("saveReceiptImport error:", err instanceof Error ? err.message : String(err));
  }
}

// ─────────────────────────────────────────────────────────────
// Recurring Expenses Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Build message listing all recurring expenses
 */
async function buildRecurringListMessage(
  userId: string,
  groupId: string
): Promise<PersonalBotMessage> {
  const expenses = await getUserRecurringExpenses(userId, { groupId });
  const stats = await getRecurringStats(userId);

  if (expenses.length === 0) {
    return {
      text: [
        `📅 <b>Gastos Recurrentes</b>`,
        ``,
        `No tenés gastos recurrentes configurados.`,
        ``,
        `Agregá tus pagos fijos mensuales (Netflix, alquiler, servicios) para que te recuerde pagarlos cada mes.`,
      ].join("\n"),
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
    `✅ Activos: ${stats.totalActive} | ⏸️ Pausados: ${stats.totalPaused}`,
    ``,
  ];

  if (active.length > 0) {
    lines.push(`<b>Activos:</b>`);
    active.forEach((e) => {
      const emoji = e.category?.emoji ?? "📦";
      lines.push(`🟢 ${emoji} ${e.name} - $${e.amountArs.toLocaleString("es-AR")} (día ${e.dayOfMonth})`);
    });
    lines.push(``);
  }

  if (paused.length > 0) {
    lines.push(`<b>⏸️ Pausados:</b>`);
    paused.forEach((e) => {
      const emoji = e.category?.emoji ?? "📦";
      lines.push(`⏸️ ${emoji} <s>${e.name}</s> - $${e.amountArs.toLocaleString("es-AR")} (día ${e.dayOfMonth})`);
    });
  }

  // Build action buttons for first 3 active
  const actionButtons = active.slice(0, 3).map((e) => ({
    text: `⏸️ ${e.name}`,
    callback_data: `recurring:toggle:${e.id}`,
  }));

  return {
    text: lines.join("\n"),
    replyMarkup: buildPersonalKeyboard([
      actionButtons.length > 0 ? actionButtons : [],
      [
        { text: "➕ Agregar", callback_data: "recurring:suggest" },
        { text: "📋 Pendientes", callback_data: "recurring:pending" },
      ],
    ].filter((row) => row.length > 0)),
  };
}

/**
 * Build message showing pending executions for this month
 */
async function buildPendingRecurringMessage(
  userId: string
): Promise<PersonalBotMessage> {
  // Auto-generate executions for this month if needed
  await createMonthlyExecutions(userId);
  
  const pending = await getPendingExecutions(userId);
  const stats = await getRecurringStats(userId);

  if (pending.length === 0) {
    if (stats.confirmedThisMonth > 0 || stats.skippedThisMonth > 0) {
      return {
        text: [
          `📅 <b>Gastos Recurrentes - Este Mes</b>`,
          ``,
          `✅ Confirmados: ${stats.confirmedThisMonth}`,
          `⏭️ Saltados: ${stats.skippedThisMonth}`,
          ``,
          `¡Ya procesaste todos tus gastos recurrentes de este mes!`,
        ].join("\n"),
        replyMarkup: buildPersonalKeyboard([
          [{ text: "📋 Ver todos", callback_data: "recurring:list" }],
        ]),
      };
    }

    return {
      text: [
        `📅 <b>Gastos Recurrentes - Este Mes</b>`,
        ``,
        `No tenés gastos pendientes.`,
        ``,
        `Los gastos recurrentes se generan el primer día de cada mes.`,
      ].join("\n"),
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
    `Tienes ${pending.length} gasto${pending.length > 1 ? "s" : ""} por confirmar:`,
    ``,
  ];

  pending.forEach((e, i) => {
    const emoji = e.recurringExpense.category?.emoji ?? "📦";
    const amount = e.amountArs ?? e.recurringExpense.amountArs;
    const status = getRecurringExecutionStatus(e);
    lines.push(`${i + 1}. ${emoji} ${e.recurringExpense.name} - $${amount.toLocaleString("es-AR")}`);
    lines.push(`   ${status.badge} • ${status.dueLabel}`);
  });

  lines.push(``);
  lines.push(`<b>Total pendiente: $${total.toLocaleString("es-AR")}</b>`);

  // Build confirm/skip buttons for each pending
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
    replyMarkup: buildPersonalKeyboard(rows),
  };
}

/**
 * Build suggestions keyboard for common recurring expenses
 */
export function buildRecurringSuggestionsMessage(): PersonalBotMessage {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];

  // Add categories as buttons
  Object.entries(RECURRING_SUGGESTIONS).slice(0, 4).forEach(([key, cat]) => {
    rows.push([{ text: `${cat.emoji} ${cat.label}`, callback_data: `recurring:category:${key}` }]);
  });

  rows.push([{ text: "✏️ Escribir nombre", callback_data: "recurring:custom" }]);
  rows.push([{ text: "❌ Cancelar", callback_data: "recurring:cancel" }]);

  return {
    text: [
      `➕ <b>Agregar Gasto Recurrente</b>`,
      ``,
      `Elegí una categoría o escribí el nombre del gasto:`,
    ].join("\n"),
    replyMarkup: buildPersonalKeyboard(rows),
  };
}
