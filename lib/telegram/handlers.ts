import { db } from "@/lib/db/client";
import { transactions, categories, monthly_settings, budgets, bot_messages, receipt_imports, telegram_link_codes, users, groups } from "@/lib/db/schema";
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
import { getReimbursementsByUser } from "@/lib/reimbursements/requests";

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


function escapeHtml(text: string): string {
  return text.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c));
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
    `${categoryEmoji} <b>${categoryName}</b>: $${formatted} ARS`,
    merchant ? `🏪 ${escapeHtml(merchant)}` : "",
  ].filter(Boolean);

  return {
    text: lines.join("\n"),
    replyMarkup: buildPersonalKeyboard([
      [
        { text: "✅ Confirmar", callback_data: "expense:confirm" },
        { text: "❌ Cancelar", callback_data: "expense:cancel" },
      ],
    ]),
  };
}

function buildReimbursementsMessage(
  reimbursements: Awaited<ReturnType<typeof getReimbursementsByUser>>,
  userId: string,
): PersonalBotMessage {
  const pendingToPay = reimbursements.filter(
    (reimbursement) => reimbursement.status === "pending" && reimbursement.payerId === userId,
  );
  const pendingRequested = reimbursements.filter(
    (reimbursement) => reimbursement.status === "pending" && reimbursement.requesterId === userId,
  );

  const toPayLines = pendingToPay.length > 0
    ? pendingToPay.map((reimbursement) => `• $${reimbursement.amount.toLocaleString("es-AR")}`)
    : ["• No tenés reintegros pendientes para pagar."];
  const requestedLines = pendingRequested.length > 0
    ? pendingRequested.map((reimbursement) => `• $${reimbursement.amount.toLocaleString("es-AR")}`)
    : ["• No tenés reintegros solicitados pendientes."];

  const keyboard = pendingToPay.length > 0
    ? buildPersonalKeyboard(
      pendingToPay.map((reimbursement) => [
        { text: "✅ Pagado", callback_data: `pay_reimbursement:${reimbursement.id}` },
      ]),
    )
    : undefined;

  return {
    text: [
      "💸 <b>Reintegros por pagar</b>",
      "",
      ...toPayLines,
      "",
      "🙋 <b>Reintegros solicitados</b>",
      "",
      ...requestedLines,
    ].join("\n"),
    replyMarkup: keyboard,
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
  merchant: string | undefined
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
    const reimbursements = await getReimbursementsByUser(userId);
    return buildReimbursementsMessage(reimbursements, userId);
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
  }

  if (text.startsWith("/gasto")) {
    const parts = text.split(" ");
    if (parts.length < 3) {
      return { text: "Uso: /gasto monto categoria descripcion\nEjemplo: /gasto 47000 supermercado Cordiez" };
    }

    const amount_ars = parseFloat(parts[1].replace(",", "."));
    if (isNaN(amount_ars) || amount_ars <= 0) {
      return { text: "Monto inválido. Usá un número positivo, ej: /gasto 47000 supermercado" };
    }

    const slug = parts[2].toLowerCase();
    const merchant = parts.slice(3).join(" ") || undefined;

    const cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, slug), eq(categories.group_id, groupId)),
    });
    if (!cat) {
      return { text: `Categoría "${slug}" no encontrada.\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos` };
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

  if (parsed.intent === "unknown" || parsed.confidence < 0.4) {
    return { text: "No entendí el mensaje. Podés usar:\n/gasto monto categoria descripcion\n/puedo monto [categoria]\n/resumen\n/disponible categoria\n/borrar_ultimo" };
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
      return { text: "Entendí que querés registrar un gasto pero no detecté el monto. Ej: \"gasté 47000 en supermercado\"" };
    }
    if (!slug) {
      return { text: `Entendí $${amount_ars.toLocaleString("es-AR")} pero no detecté la categoría.\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos` };
    }

    const cat = await db.query.categories.findFirst({
      where: and(eq(categories.slug, slug), eq(categories.group_id, groupId)),
    });
    if (!cat) {
      return { text: `No encontré la categoría "${slug}".\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos` };
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
      merchant
    );
  }

  return { text: "No entendí el mensaje. Podés usar:\n/gasto monto categoria\n/resumen\n/disponible categoria\n/puedo monto [categoria]" };
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
