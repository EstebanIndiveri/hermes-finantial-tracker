import { db } from "@/lib/db/client";
import { transactions, categories, monthly_settings, budgets, bot_messages, receipt_imports, telegram_link_codes, users } from "@/lib/db/schema";
import { eq, and, sum, desc, gt } from "drizzle-orm";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { calculateCategoryStatus, calculateMonthStatus } from "@/lib/finance/rules";
import { formatTransactionConfirm, formatResumen, formatDisponible, formatPuedo } from "./formatters";
import { ocrTelegramPhoto, ocrTelegramDocument } from "./ocr";
import { parseReceiptText } from "@/lib/ai/parse-receipt";
import { randomUUID } from "crypto";

function escapeHtml(text: string): string {
  return text.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c));
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

/**
 * KNOWN LIMITATION: These in-memory Maps are wiped on serverless cold starts.
 * TODO: persist in DB with TTL for production multi-instance use.
 */
const pendingExceptions = new Map<string, { category_id: string; amount_ars: number; merchant?: string }>();

/** Receipt proposals are persisted in receipt_imports table (status="pending") — no in-memory state needed */

export async function handleTelegramMessage(update: TelegramUpdate, userId: string): Promise<string> {
  const msg = update.message;
  if (!msg) return "Mensaje no reconocido.";
  
  const text = (msg.text ?? "").trim();
  const chatId = String(msg.chat.id);
  const month = getActiveMonthArgentina();

  if (text === "/start") {
    return "👋 Hola! Soy Hermes Finance.\n\nComandos:\n/gasto monto categoria descripcion\n/puedo monto [categoria]\n/resumen\n/disponible categoria\n/ultimo\n/borrar_ultimo";
  }

  if (text === "/resumen") {
    const summary = await getMonthSummary(userId, month);
    if (!summary) return "No hay configuración para este mes. Configurá desde la web.";
    return formatResumen({ month, ...summary });
  }

  if (text.startsWith("/disponible")) {
    const slug = text.split(" ")[1]?.toLowerCase();
    if (!slug) return "Uso: /disponible categoria\nEjemplo: /disponible supermercado";

    const cat = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
    if (!cat) return `No encontré la categoría "${slug}".`;

    const breakdown = await getCategoryBreakdown(userId, month);
    const catData = breakdown.find(c => c.id === cat.id);
    if (!catData) return `Sin datos para ${cat.name} este mes.`;

    return formatDisponible({
      category: catData.name,
      emoji: catData.emoji,
      budget_ars: catData.budget_ars,
      gastado_ars: catData.gastado_ars,
      disponible_ars: catData.disponible_ars,
      status: catData.status,
    });
  }

  if (text === "/ultimo") {
    const last = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.user_id, userId),
        eq(transactions.month, month),
        eq(transactions.status, "active")
      ),
      orderBy: (t, { desc }) => desc(t.created_at),
      with: { category: true },
    });
    if (!last) return "No hay transacciones activas este mes.";
    const lastWithCat = last as typeof last & { category?: { emoji: string; name: string } };
    const catStr = `${lastWithCat.category?.emoji ?? ""} ${lastWithCat.category?.name ?? ""}`.trim();
    return `Último: ${catStr} — $${last.amount_ars.toLocaleString("es-AR")}${last.merchant ? ` (${escapeHtml(last.merchant)})` : ""} — ${last.date}`;
  }

  if (text === "/borrar_ultimo") {
    const last = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.user_id, userId),
        eq(transactions.month, month),
        eq(transactions.status, "active")
      ),
      orderBy: (t, { desc }) => desc(t.created_at),
    });
    if (!last) return "No hay transacciones activas para borrar.";
    await db.update(transactions)
      .set({ status: "deleted", deleted_at: Date.now() })
      .where(eq(transactions.id, last.id));
    return `✅ Eliminado: $${last.amount_ars.toLocaleString("es-AR")} del ${last.date}`;
  }

  if (text === "/confirmar" && pendingExceptions.has(chatId)) {
    const pending = pendingExceptions.get(chatId)!;
    pendingExceptions.delete(chatId);
    return (await registerTransaction(userId, pending.category_id, pending.amount_ars, pending.merchant, month, true)).message;
  }

  if (text === "/cancelar") {
    pendingExceptions.delete(chatId);
    return "Cancelado.";
  }

  // ── /confirmar_ticket ─────────────────────────────────────────
  if (text === "/confirmar_ticket") {
    const rows = await db
      .select()
      .from(receipt_imports)
      .where(and(
        eq(receipt_imports.user_id, userId),
        eq(receipt_imports.status, "pending")
      ))
      .orderBy(desc(receipt_imports.created_at))
      .limit(1);

    const pendingImport = rows[0] ?? null;

    if (!pendingImport || !pendingImport.parsed_amount_ars) {
      return "No hay ticket pendiente de confirmar. Enviá una foto primero.";
    }

    const slug = pendingImport.parsed_category_slug ?? null;
    if (!slug) {
      return `⚠️ Falta la categoría. Escribila primero (ej: <code>servicios</code>) y luego /confirmar_ticket.`;
    }

    const catRows = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    const cat = catRows[0] ?? null;
    if (!cat) {
      return `⚠️ Categoría "${slug}" no encontrada. Escribí la categoría correcta para continuar.`;
    }

    const result = await registerTransaction(
      userId, cat.id, pendingImport.parsed_amount_ars,
      pendingImport.parsed_merchant ?? undefined, month, false
    );

    try {
      await db.update(receipt_imports)
        .set({ status: "confirmed", transaction_id: result.transactionId })
        .where(eq(receipt_imports.id, pendingImport.id));
    } catch (err) {
      console.error("receipt_imports confirm error:", err instanceof Error ? err.message : String(err));
    }

    return result.message;
  }

  // ── /cancelar_ticket ──────────────────────────────────────────
  if (text === "/cancelar_ticket") {
    try {
      await db.update(receipt_imports)
        .set({ status: "rejected" })
        .where(
          and(
            eq(receipt_imports.user_id, userId),
            eq(receipt_imports.status, "pending")
          )
        );
    } catch { /* swallow */ }

    return "❌ Importación cancelada.";
  }

  // ── EDIT LOOP: free text while a receipt is pending in DB ─────
  const pendingEditRows = text && !text.startsWith("/")
    ? await db
        .select()
        .from(receipt_imports)
        .where(and(
          eq(receipt_imports.user_id, userId),
          eq(receipt_imports.status, "pending")
        ))
        .orderBy(desc(receipt_imports.created_at))
        .limit(1)
    : [];

  const pendingImport = pendingEditRows[0] ?? null;

  if (pendingImport && text && !text.startsWith("/")) {
    const { parseFinancialMessage } = await import("@/lib/ai/parse-message");
    const parsed = await parseFinancialMessage(text);

    // Merge corrections into current DB state
    let newAmount = pendingImport.parsed_amount_ars ?? 0;
    let newSlug = pendingImport.parsed_category_slug ?? null;
    let newMerchant = pendingImport.parsed_merchant ?? null;

    if (parsed.amount_ars && parsed.amount_ars > 0) newAmount = parsed.amount_ars;

    if (parsed.category) {
      const slug = parsed.category.toLowerCase();
      const catEditRows = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
      if (catEditRows[0]) newSlug = slug;
    }

    if (parsed.merchant) newMerchant = parsed.merchant;
    // Plain short text with no number/category → treat as merchant name
    if (!parsed.amount_ars && !parsed.category && text.length < 40) {
      newMerchant = text.trim();
    }

    // Persist the corrected values back to receipt_imports
    try {
      await db.update(receipt_imports)
        .set({
          parsed_amount_ars: newAmount,
          parsed_category_slug: newSlug,
          parsed_merchant: newMerchant,
        })
        .where(eq(receipt_imports.id, pendingImport.id));
    } catch (err) {
      console.error("receipt_imports edit error:", err instanceof Error ? err.message : String(err));
    }

    // Resolve category display info
    const catDispRows = newSlug
      ? await db.select().from(categories).where(eq(categories.slug, newSlug)).limit(1)
      : [];
    const cat = catDispRows[0] ?? null;

    return buildReceiptProposalMessage({
      amount_ars: newAmount,
      categoryName: cat?.name ?? "sin categoría",
      categoryEmoji: cat?.emoji ?? "📦",
      merchant: newMerchant ?? undefined,
      date: pendingImport.parsed_date ?? getArgentinaDate().toISOString().slice(0, 10),
      source: "edit",
    });
  }

  if (text.startsWith("/gasto")) {
    const parts = text.split(" ");
    if (parts.length < 3) {
      return "Uso: /gasto monto categoria descripcion\nEjemplo: /gasto 47000 supermercado Cordiez";
    }

    const amount_ars = parseFloat(parts[1].replace(",", "."));
    if (isNaN(amount_ars) || amount_ars <= 0) {
      return "Monto inválido. Usá un número positivo, ej: /gasto 47000 supermercado";
    }

    const slug = parts[2].toLowerCase();
    const merchant = parts.slice(3).join(" ") || undefined;

    const cat = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
    if (!cat) {
      return `Categoría "${slug}" no encontrada.\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos`;
    }

    const settings = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
    });
    if (!settings) return "Sin configuración mensual. Configurá desde la web.";

    const budget = await db.query.budgets.findFirst({
      where: and(
        eq(budgets.user_id, userId),
        eq(budgets.month, month),
        eq(budgets.category_id, cat.id)
      ),
    });

    if (budget && budget.budget_ars > 0) {
      const spentRows = await db
        .select({ total: sum(transactions.amount_ars) })
        .from(transactions)
        .where(and(
          eq(transactions.user_id, userId),
          eq(transactions.month, month),
          eq(transactions.category_id, cat.id),
          eq(transactions.status, "active")
        ));
      const gastado = Number(spentRows[0]?.total ?? 0);
      const status = calculateCategoryStatus({ gastado_ars: gastado, budget_ars: budget.budget_ars });

      if (status === "CLOSED") {
        if (budget.hard_limit) {
          return `🔴 ${cat.name} está CERRADA con límite duro. No se puede registrar.`;
        }
        pendingExceptions.set(chatId, { category_id: cat.id, amount_ars, merchant });
        return `⚠️ ${cat.name} está CERRADA (sin límite duro).\nGastado: $${gastado.toLocaleString("es-AR")} / $${budget.budget_ars.toLocaleString("es-AR")}\nRespondé /confirmar para registrar como excepción o /cancelar para cancelar.`;
      }

      if (gastado + amount_ars > budget.budget_ars && budget.hard_limit) {
        return `🔴 Este gasto excede el presupuesto de ${cat.name} (límite duro). No se puede registrar.`;
      }
    }

    return (await registerTransaction(userId, cat.id, amount_ars, merchant, month, false)).message;
  }

  // ── /puedo monto categoria ──
  if (text.startsWith("/puedo")) {
    const parts = text.split(" ");
    if (parts.length < 2) {
      return "Uso: /puedo monto [categoria]\nEjemplo: /puedo 35000 salidas_pareja";
    }

    const amount_ars = parseFloat(parts[1].replace(",", "."));
    if (isNaN(amount_ars) || amount_ars <= 0) {
      return "Monto inválido. Ej: /puedo 35000 salidas_pareja";
    }

    const slug = parts[2]?.toLowerCase() ?? null;

    const [summary, breakdown] = await Promise.all([
      getMonthSummary(userId, month),
      getCategoryBreakdown(userId, month),
    ]);

    if (!summary) return "Sin configuración mensual. Configurá desde la web.";

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
        return `No encontré la categoría "${slug}".\nDisponibles: ${list}`;
      }

      const newGastado = catData.gastado_ars + amount_ars;
      const newCategoryStatus = calculateCategoryStatus({
        gastado_ars: newGastado,
        budget_ars: catData.budget_ars,
      });
      const disponible_after = catData.budget_ars > 0 ? catData.budget_ars - newGastado : null;

      return formatPuedo({
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
      });
    }

    // No category — show only savings impact
    const monthIcon = newMonthStatus === "GREEN" ? "🟢" : newMonthStatus === "YELLOW" ? "🟡" : "🔴";
    const decision = newMonthStatus === "RED"
      ? "🔴 <b>Cuidado</b> — este gasto pondría tu ahorro en rojo."
      : newMonthStatus === "YELLOW"
        ? "🟡 <b>Podés, pero con cuidado</b> — estarías ajustado."
        : "🟢 <b>Sí podés</b> — sin comprometer tus metas.";

    return [
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
    ].filter(l => l !== "").join("\n");
  }

  // ── Photo / Document → OCR ticket import ────────────────────
  const isPhoto = !!msg.photo?.length;
  const isImageDoc = !!(msg.document?.mime_type?.startsWith("image/"));

  if (isPhoto || isImageDoc) {
    const caption = msg.caption?.trim() ?? "";
    const receiptId = randomUUID();
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
          ? await db.query.categories.findFirst({ where: eq(categories.slug, slug) })
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
          return [
            `🧾 Detecté en el caption: <b>$${parsed.amount_ars.toLocaleString("es-AR")}</b>`,
            `⚠️ No reconocí la categoría "${slug ?? "(ninguna)"}".`,
            `Usá: /gasto ${parsed.amount_ars} [categoria] ${parsed.merchant ?? ""}`,
          ].join("\n");
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
      return "📷 No pude leer el ticket. Usá /gasto monto categoria descripción.";
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
      ? await db.query.categories.findFirst({ where: eq(categories.slug, slug) })
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
      return [
        `📷 <b>Texto del ticket (OCR):</b>`,
        `<code>${escapeHtml(ocrText.slice(0, 400))}</code>`,
        ``,
        `No pude detectar el monto. Usá /gasto monto categoria descripción.`,
      ].join("\n");
    }

    if (!cat) {
      // No category detected — state already in DB (status=pending), user must type it
      return [
        `🧾 <b>Ticket detectado</b> (🔍 OCR)`,
        ``,
        `💰 <b>Monto:</b> $${amount_ars.toLocaleString("es-AR")} ARS`,
        merchant ? `🏪 <b>Comercio:</b> ${escapeHtml(merchant)}` : "",
        `📅 <b>Fecha:</b> ${parsedDate}`,
        ``,
        `⚠️ No detecté la categoría. Respondé con la categoría para continuar:`,
        `supermercado · verduleria · salidas_pareja · restaurante · servicios · tarjeta · movilidad · viaje · pareja · compras_personales · imprevistos`,
        ``,
        `O usá: /gasto ${amount_ars} [categoria]${merchant ? ` ${merchant}` : ""}`,
        `/cancelar_ticket → descartar`,
      ].filter(Boolean).join("\n");
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
    if (!code) return "Uso: /vincular XXXXXX\nGenerá tu código en el dashboard → Configuración.";

    const telegramUserId = String(msg.from.id);

    const linkCode = await db.query.telegram_link_codes.findFirst({
      where: and(
        eq(telegram_link_codes.id, code),
        eq(telegram_link_codes.used, 0),
        gt(telegram_link_codes.expires_at, Date.now()),
      ),
    });

    if (!linkCode) {
      return "❌ Código inválido o expirado. Generá uno nuevo desde el dashboard → Configuración → Conectar Telegram.";
    }

    // Check if this Telegram account is already linked to another user
    const existingLink = await db.query.users.findFirst({
      where: eq(users.telegram_user_id, telegramUserId),
    });
    if (existingLink && existingLink.id !== linkCode.user_id) {
      return "⚠️ Este Telegram ya está vinculado a otra cuenta. Desvinculá desde la web primero.";
    }

    await db.update(users).set({ telegram_user_id: telegramUserId }).where(eq(users.id, linkCode.user_id));
    await db.update(telegram_link_codes).set({ used: 1 }).where(eq(telegram_link_codes.id, code));

    return "✅ ¡Cuenta vinculada correctamente! Ya podés usar el bot con tu usuario.";
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return "Por ahora usá el formato: /gasto monto categoria descripción";
  }

  const { parseFinancialMessage } = await import("@/lib/ai/parse-message");
  const parsed = await parseFinancialMessage(text);

  if (parsed.intent === "unknown" || parsed.confidence < 0.4) {
    return "No entendí el mensaje. Podés usar:\n/gasto monto categoria descripcion\n/puedo monto [categoria]\n/resumen\n/disponible categoria\n/borrar_ultimo";
  }

  // ── query_summary → /resumen ──
  if (parsed.intent === "query_summary") {
    const summary = await getMonthSummary(userId, month);
    if (!summary) return "No hay configuración para este mes. Configurá desde la web.";
    return formatResumen({ month, ...summary });
  }

  // ── delete_last → /borrar_ultimo ──
  if (parsed.intent === "delete_last") {
    const last = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.user_id, userId),
        eq(transactions.month, month),
        eq(transactions.status, "active")
      ),
      orderBy: (t, { desc }) => desc(t.created_at),
    });
    if (!last) return "No hay transacciones activas para borrar.";
    await db.update(transactions)
      .set({ status: "deleted", deleted_at: Date.now() })
      .where(eq(transactions.id, last.id));
    return `✅ Eliminado: $${last.amount_ars.toLocaleString("es-AR")} del ${last.date}`;
  }

  // ── query_available → /disponible ──
  if (parsed.intent === "query_available") {
    const slug = parsed.category?.toLowerCase() ?? null;
    if (!slug) {
      // No specific category — show all
      const breakdown = await getCategoryBreakdown(userId, month);
      const lines = breakdown
        .filter(c => c.budget_ars > 0)
        .map(c => {
          const icon = c.status === "OK" ? "🟢" : c.status === "WARNING" ? "🟡" : "🔴";
          const disp = c.disponible_ars !== null ? `$${c.disponible_ars.toLocaleString("es-AR")} disponible` : "sin límite";
          return `${icon} ${c.emoji} ${c.name}: ${disp}`;
        });
      return lines.length > 0
        ? `<b>💰 Disponible este mes:</b>\n\n${lines.join("\n")}`
        : "Sin presupuestos configurados.";
    }

    const cat = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
    if (!cat) return `No encontré la categoría "${slug}".`;
    const breakdown = await getCategoryBreakdown(userId, month);
    const catData = breakdown.find(c => c.id === cat.id);
    if (!catData) return `Sin datos para ${cat.name} este mes.`;
    return formatDisponible({
      category: catData.name,
      emoji: catData.emoji,
      budget_ars: catData.budget_ars,
      gastado_ars: catData.gastado_ars,
      disponible_ars: catData.disponible_ars,
      status: catData.status,
    });
  }

  // ── simulate_expense → lógica de /puedo ──
  if (parsed.intent === "simulate_expense") {
    const amount_ars = parsed.amount_ars ?? null;
    if (!amount_ars || amount_ars <= 0) {
      return "Entendí que querés saber si podés gastar algo, pero no detecté el monto. Ej: \"puedo gastar 36000 en restaurante\"";
    }
    const slug = parsed.category?.toLowerCase() ?? null;
    const [summary, breakdown] = await Promise.all([
      getMonthSummary(userId, month),
      getCategoryBreakdown(userId, month),
    ]);
    if (!summary) return "Sin configuración mensual. Configurá desde la web.";
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
        return `No encontré la categoría "${slug}".\nDisponibles: ${list}`;
      }
      const newGastado = catData.gastado_ars + amount_ars;
      const newCategoryStatus = calculateCategoryStatus({ gastado_ars: newGastado, budget_ars: catData.budget_ars });
      const disponible_after = catData.budget_ars > 0 ? catData.budget_ars - newGastado : null;
      return formatPuedo({
        amount_ars, category: catData.name, emoji: catData.emoji,
        gastado_ars: catData.gastado_ars, budget_ars: catData.budget_ars,
        newCategoryStatus, disponible_after,
        ahorro_usd_before, ahorro_usd_after, newMonthStatus,
        saving_goal_usd: summary.saving_goal_usd,
      });
    }
    const monthIcon = newMonthStatus === "GREEN" ? "🟢" : newMonthStatus === "YELLOW" ? "🟡" : "🔴";
    const decision = newMonthStatus === "RED"
      ? "🔴 <b>Cuidado</b> — este gasto pondría tu ahorro en rojo."
      : newMonthStatus === "YELLOW"
        ? "🟡 <b>Podés, pero con cuidado</b> — estarías ajustado."
        : "🟢 <b>Sí podés</b> — sin comprometer tus metas.";
    return [
      `💭 <b>¿Podés gastar ${amount_ars.toLocaleString("es-AR")} ARS?</b>`,
      ``,
      decision,
      ``,
      `<b>💰 Impacto en ahorro:</b>`,
      `Antes: USD ${ahorro_usd_before.toFixed(0)} → Después: USD ${ahorro_usd_after.toFixed(0)} ${monthIcon}`,
      summary.saving_goal_usd > 0
        ? `Meta: USD ${summary.saving_goal_usd.toFixed(0)} (${Math.round((ahorro_usd_after / summary.saving_goal_usd) * 100)}% alcanzado)`
        : "",
    ].filter(l => l !== "").join("\n");
  }

  // ── register_expense → lógica de /gasto ──
  if (parsed.intent === "register_expense") {
    const amount_ars = parsed.amount_ars ?? null;
    const slug = parsed.category?.toLowerCase() ?? null;

    if (!amount_ars || amount_ars <= 0) {
      return "Entendí que querés registrar un gasto pero no detecté el monto. Ej: \"gasté 47000 en supermercado\"";
    }
    if (!slug) {
      return `Entendí $${amount_ars.toLocaleString("es-AR")} pero no detecté la categoría.\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos`;
    }

    const cat = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
    if (!cat) {
      return `No encontré la categoría "${slug}".\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, movilidad, viaje, pareja, compras_personales, imprevistos`;
    }

    const merchant = parsed.merchant ?? parsed.description ?? undefined;

    const budget = await db.query.budgets.findFirst({
      where: and(eq(budgets.user_id, userId), eq(budgets.month, month), eq(budgets.category_id, cat.id)),
    });

    if (budget && budget.budget_ars > 0) {
      const spentRows = await db
        .select({ total: sum(transactions.amount_ars) })
        .from(transactions)
        .where(and(
          eq(transactions.user_id, userId),
          eq(transactions.month, month),
          eq(transactions.category_id, cat.id),
          eq(transactions.status, "active")
        ));
      const gastado = Number(spentRows[0]?.total ?? 0);
      const status = calculateCategoryStatus({ gastado_ars: gastado, budget_ars: budget.budget_ars });

      if (status === "CLOSED") {
        if (budget.hard_limit) {
          return `🔴 ${cat.name} está CERRADA con límite duro. No se puede registrar.`;
        }
        pendingExceptions.set(chatId, { category_id: cat.id, amount_ars, merchant });
        return `⚠️ ${cat.name} está CERRADA (sin límite duro).\nGastado: $${gastado.toLocaleString("es-AR")} / $${budget.budget_ars.toLocaleString("es-AR")}\nRespondé /confirmar para registrar como excepción o /cancelar para cancelar.`;
      }

      if (gastado + amount_ars > budget.budget_ars && budget.hard_limit) {
        return `🔴 Este gasto excede el presupuesto de ${cat.name} (límite duro). No se puede registrar.`;
      }
    }

    return (await registerTransaction(userId, cat.id, amount_ars, merchant, month, false)).message;
  }

  return "No entendí el mensaje. Podés usar:\n/gasto monto categoria\n/resumen\n/disponible categoria\n/puedo monto [categoria]";
}

async function registerTransaction(
  userId: string,
  category_id: string,
  amount_ars: number,
  merchant: string | undefined,
  month: string,
  is_exception: boolean
): Promise<{ message: string; transactionId: string }> {
  merchant = merchant ? escapeHtml(merchant) : undefined;
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
  });
  if (!settings) return { message: "Sin configuración mensual.", transactionId: "" };

  const amount_usd = parseFloat((amount_ars / settings.exchange_rate).toFixed(2));
  const date = getArgentinaDate().toISOString().slice(0, 10);
  const txId = randomUUID();

  await db.insert(transactions).values({
    id: txId,
    user_id: userId,
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
    where: and(eq(budgets.user_id, userId), eq(budgets.month, month), eq(budgets.category_id, category_id)),
  });

  const spentRows = await db
    .select({ total: sum(transactions.amount_ars) })
    .from(transactions)
    .where(and(
      eq(transactions.user_id, userId),
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

  const summary = await getMonthSummary(userId, month);

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
function buildReceiptProposalMessage({
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
}): string {
  const sourceLabel = source === "caption" ? "📝 caption" : source === "edit" ? "✏️ editado" : "🔍 OCR";
  return [
    `🧾 <b>Ticket detectado</b> (${sourceLabel})`,
    ``,
    `💰 <b>Monto:</b> $${amount_ars.toLocaleString("es-AR")} ARS`,
    `📂 <b>Categoría:</b> ${categoryEmoji} ${categoryName}`,
    merchant ? `🏪 <b>Comercio:</b> ${escapeHtml(merchant)}` : "",
    `📅 <b>Fecha:</b> ${date}`,
    ``,
    `¿Todo bien? Confirmá o corregí:`,
    `/confirmar_ticket → registrar`,
    `/cancelar_ticket → descartar`,
    `O escribí correcciones, ej: <code>35000</code> / <code>restaurante</code> / <code>CORDIEZ</code>`,
  ].filter(Boolean).join("\n");
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
