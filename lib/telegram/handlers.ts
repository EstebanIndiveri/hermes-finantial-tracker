import { db } from "@/lib/db/client";
import { transactions, categories, monthly_settings, budgets, bot_messages } from "@/lib/db/schema";
import { eq, and, sum } from "drizzle-orm";
import { getActiveMonthArgentina, getArgentinaDate } from "@/lib/utils/dates";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { calculateCategoryStatus, calculateMonthStatus } from "@/lib/finance/rules";
import { formatTransactionConfirm, formatResumen, formatDisponible, formatPuedo } from "./formatters";
import { randomUUID } from "crypto";

function escapeHtml(text: string): string {
  return text.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c));
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number };
    from: { id: number };
  };
}

/**
 * KNOWN LIMITATION: This in-memory Map will be wiped on serverless cold starts
 * and is not shared across multiple function instances. In a production serverless
 * environment (Vercel, AWS Lambda), users may lose pending confirmation state.
 * 
 * TODO: For production, store pending confirmations in database with TTL:
 *   - Add `pending_confirmations` table with: chat_id, category_id, amount_ars, merchant, expires_at
 *   - Query and cleanup expired entries before checking
 *   - This ensures persistence across cold starts and instances
 */
const pendingExceptions = new Map<string, { category_id: string; amount_ars: number; merchant?: string }>();

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
    return registerTransaction(userId, pending.category_id, pending.amount_ars, pending.merchant, month, true);
  }

  if (text === "/cancelar") {
    pendingExceptions.delete(chatId);
    return "Cancelado.";
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
      return `Categoría "${slug}" no encontrada.\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, viaje, compras_personales, imprevistos`;
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

    return registerTransaction(userId, cat.id, amount_ars, merchant, month, false);
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
      return `Entendí $${amount_ars.toLocaleString("es-AR")} pero no detecté la categoría.\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, viaje, compras_personales, imprevistos`;
    }

    const cat = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
    if (!cat) {
      return `No encontré la categoría "${slug}".\nCategorías: supermercado, verduleria, salidas_pareja, restaurante, servicios, tarjeta, viaje, compras_personales, imprevistos`;
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

    return registerTransaction(userId, cat.id, amount_ars, merchant, month, false);
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
): Promise<string> {
  merchant = merchant ? escapeHtml(merchant) : undefined;
  const settings = await db.query.monthly_settings.findFirst({
    where: and(eq(monthly_settings.user_id, userId), eq(monthly_settings.month, month)),
  });
  if (!settings) return "Sin configuración mensual.";

  const amount_usd = parseFloat((amount_ars / settings.exchange_rate).toFixed(2));
  const date = getArgentinaDate().toISOString().slice(0, 10);

  await db.insert(transactions).values({
    id: randomUUID(),
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

  return formatTransactionConfirm({
    amount_ars,
    category: cat?.name ?? "—",
    emoji: cat?.emoji ?? "📦",
    gastado_ars,
    budget_ars,
    disponible_ars,
    status,
    ahorro_proyectado_usd: summary?.ahorro_proyectado_usd ?? 0,
  });
}
