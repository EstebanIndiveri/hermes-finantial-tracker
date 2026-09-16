/**
 * Deterministic expense parser used as a robust fallback when the AI parser
 * (Groq) fails, returns `unknown`, or produces a low-confidence result.
 *
 * The AI parser is the primary path, but it is occasionally flaky and misses
 * clear, well-formatted messages such as "Gaste 13568 supermercado" or
 * "Gasto 16739 salidas pareja". This module guarantees that any message that
 * contains a recognizable amount and/or category is handled deterministically,
 * so the core "register an expense" feature never falls back to a generic
 * "no pude interpretar" error when the intent is actually clear.
 */

/**
 * Category keyword mapping for BOT intent detection. The actual category record
 * (and its canonical slug) is resolved against the DB later — these keywords
 * only decide *which* category slug a free-form message refers to.
 *
 * Order matters: earlier entries win when a token could match several
 * categories. Keep the more specific / higher-priority categories first.
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  supermercado: ["super", "súper", "supermercado", "mercado", "chino", "almacén", "almacen", "carrefour", "disco", "coto", "jumbo"],
  verduleria: ["verdulería", "verduleria", "verdura", "verduras", "frutería", "fruteria", "fruta", "frutas"],
  restaurante: ["restaurante", "restaurant", "resto", "comida", "almuerzo", "cena", "pizzería", "pizzeria", "bar"],
  servicios: ["servicios", "servicio", "luz", "gas", "agua", "internet", "cable", "celular", "teléfono", "telefono", "electricidad"],
  movilidad: ["movilidad", "transporte", "uber", "taxi", "colectivo", "nafta", "combustible", "bondi", "subte"],
  tarjeta: ["tarjeta", "tarjetas", "credito", "crédito"],
  salidas_pareja: ["salida", "salidas", "pareja", "cita", "novio", "novia"],
  viaje: ["viaje", "viajes", "vacaciones", "pasaje", "pasajes"],
  compras_personales: ["compras", "personal", "personales", "ropa", "farmacia", "remedios", "medicamentos", "perfumería", "perfumeria"],
  imprevistos: ["imprevisto", "imprevistos", "emergencia", "urgencia"],
};

/** Spanish number words 0-29 and tens, used for "quince mil" style amounts. */
const NUMBER_UNITS: Record<string, number> = {
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90,
};

/** Removes diacritics and lowercases for accent-insensitive matching. */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Parses a single numeric token into an integer/decimal amount, correctly
 * handling Argentine ("16.739" = 16739) and US ("13,568" = 13568) grouping.
 *
 * @param raw - A token that contains digits, e.g. "16.739", "13,568", "19,50".
 * @returns The parsed number, or null when the token is not a valid amount.
 */
export function parseAmountToken(raw: string): number | null {
  const t = raw.trim();
  if (!/\d/.test(t)) return null;

  // Grouped thousands with . or , separators: 16.739 / 1.234.567 / 13,568
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) {
    return parseInt(t.replace(/[.,]/g, ""), 10);
  }
  // Decimal with comma (Argentine decimal): 19,50
  if (/^\d+,\d{1,2}$/.test(t)) {
    return parseFloat(t.replace(",", "."));
  }
  // Decimal with dot: 19.50
  if (/^\d+\.\d{1,2}$/.test(t)) {
    return parseFloat(t);
  }
  // Plain digits (strip any stray separators): 15000 / 16739
  const digits = t.replace(/[.,]/g, "");
  if (/^\d+$/.test(digits)) {
    const n = parseInt(digits, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Extracts a monetary amount from a free-form message, supporting numbers,
 * Argentine/US grouping, and Spanish slang ("15 mil", "15k", "15 lucas",
 * "2 palos", "quince mil").
 *
 * Selection strategy (to avoid grabbing a year/quantity by accident):
 *   1. Slang expressions (k / lucas / palos) win — they are unambiguous amounts.
 *   2. A "N mil" expression wins next (N a digit or Spanish unit word).
 *   3. Otherwise the FIRST plain numeric token in reading order is used, which
 *      matches how users state the amount up front ("gasté 13568 en super").
 *
 * @param text - The raw user message (already transcribed if it was voice).
 * @returns The detected amount (> 0), or null when no amount is present.
 */
export function extractAmountFromMessage(text: string): number | null {
  const norm = normalize(text)
    .replace(/\$/g, " ")
    .replace(/\bpesos?\b/g, " ")
    .replace(/\bars?\b/g, " ");

  // 1) "15k" / "1.5k" → thousands
  const kMatch = norm.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (kMatch) {
    const n = parseFloat(kMatch[1].replace(",", "."));
    if (!Number.isNaN(n) && n > 0) return n * 1000;
  }

  // "15 lucas" → thousands
  const lucasMatch = norm.match(/(\d+(?:[.,]\d+)?)\s*lucas?\b/);
  if (lucasMatch) {
    const n = parseFloat(lucasMatch[1].replace(",", "."));
    if (!Number.isNaN(n) && n > 0) return n * 1000;
  }

  // "2 palos" → millions
  const palosMatch = norm.match(/(\d+(?:[.,]\d+)?)\s*palos?\b/);
  if (palosMatch) {
    const n = parseFloat(palosMatch[1].replace(",", "."));
    if (!Number.isNaN(n) && n > 0) return n * 1000000;
  }

  // 2) "15 mil" / "quince mil" → thousands. Only accept a digit or a known
  // Spanish unit word as the prefix (so "por mil" is NOT read as "por"*1000).
  const milMatch = norm.match(/(\d+|[a-záéíóúü]+)\s+mil\b/);
  if (milMatch) {
    const prefix = milMatch[1];
    let prefixNum = parseFloat(prefix);
    if (Number.isNaN(prefixNum)) prefixNum = NUMBER_UNITS[prefix] ?? NaN;
    if (!Number.isNaN(prefixNum) && prefixNum > 0) return prefixNum * 1000;
  }
  // Standalone "mil" (no numeric prefix) → 1000
  if (/\bmil\b/.test(norm)) return 1000;

  // 3) First plain numeric token in reading order.
  const tokens = norm.match(/\d[\d.,]*\d|\d/g) ?? [];
  for (const tok of tokens) {
    const val = parseAmountToken(tok);
    if (val !== null && val > 0) return val;
  }
  return null;
}

/**
 * Expense verbs and connectors that must never be interpreted as a category.
 * (e.g. "gasto"/"gaste" contains "gas", which must not match `servicios`.)
 */
const CATEGORY_STOPWORDS = new Set([
  "gasto", "gaste", "gastar", "gastos", "gato", "gota", "gacho",
  "compre", "compra", "compras", "comprar", "pague", "pago", "pagar",
  "nuevo", "quiero", "registrar", "acabo", "hice", "una", "uno",
  "con", "sin", "los", "las", "del", "por", "para", "que",
]);

/**
 * True when a token refers to a category keyword. Substring matches require a
 * minimum length of 4 to avoid short keywords like "gas"/"luz"/"bar" matching
 * unrelated words (e.g. the verb "gaste" must NOT match "gas").
 */
function keywordMatches(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  if (keyword.length >= 4 && token.startsWith(keyword)) return true;
  if (token.length >= 4 && keyword.startsWith(token)) return true;
  return false;
}

/**
 * Detects which category slug a message refers to by scanning every token
 * against {@link CATEGORY_KEYWORDS}. Unlike a verb-anchored regex, this checks
 * the whole message, so the amount token never shadows the category.
 *
 * @param text - The raw user message.
 * @returns The matched category slug, or null when no category is recognized.
 */
export function detectCategorySlug(text: string): string | null {
  const tokens = normalize(text).split(/[\s.,!?"']+/).filter(Boolean);

  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const normKeywords = keywords.map(normalize);
    for (const token of tokens) {
      if (token.length < 3) continue; // avoid false matches on short tokens
      if (/^\d+$/.test(token)) continue; // never treat a number as a category
      if (CATEGORY_STOPWORDS.has(token)) continue; // skip verbs/connectors
      if (normKeywords.some((k) => keywordMatches(token, k))) {
        return slug;
      }
    }
  }
  return null;
}

/**
 * True when the message explicitly asks for a reimbursement/reembolso. Used to
 * guard against the AI hallucinating `requires_reimbursement` on plain expenses.
 *
 * @param text - The raw user message.
 */
export function hasReimbursementIntent(text: string): boolean {
  return /reintegr|reembols/i.test(text);
}

export type SimpleQueryIntent = "query_available" | "query_summary" | "query_reimbursements";

/**
 * Detects simple, unambiguous query intents from short messages that the AI
 * sometimes fails to classify (e.g. the single word "disponible").
 *
 * Only fires when the message contains NO amount, so it never steals a real
 * expense registration.
 *
 * @param text - The raw user message.
 * @returns The detected query intent, or null.
 */
export function detectSimpleQueryIntent(text: string): SimpleQueryIntent | null {
  const norm = normalize(text).trim();

  // Guard: if there is an amount, this is likely an expense, not a query.
  if (extractAmountFromMessage(text) !== null) return null;

  if (/^\/?disponibles?\b/.test(norm) || /\bque\s+(?:me\s+)?queda\b/.test(norm) || /\bdisponibles?\b/.test(norm)) {
    return "query_available";
  }
  if (/^\/?resumen\b/.test(norm) || /\bcomo\s+voy\b/.test(norm) || /\bestado\s+del\s+mes\b/.test(norm)) {
    return "query_summary";
  }
  if (/^\/?reintegros?\b/.test(norm) || /^\/?reembolsos?\b/.test(norm)) {
    return "query_reimbursements";
  }
  return null;
}

export interface ExpenseFallbackResult {
  amount: number | null;
  categorySlug: string | null;
  requiresReimbursement: boolean;
}

/**
 * Runs the full deterministic expense parse over a message.
 *
 * @param text - The raw user message.
 * @returns Extracted amount, category slug, and reimbursement flag.
 */
export function parseExpenseFallback(text: string): ExpenseFallbackResult {
  return {
    amount: extractAmountFromMessage(text),
    categorySlug: detectCategorySlug(text),
    requiresReimbursement: hasReimbursementIntent(text),
  };
}
