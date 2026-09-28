/** Shared, provider-independent contract for personal Telegram financial input. */
export type FinancialDraftSource = "command" | "text" | "voice" | "receipt";
export type ReimbursementIntent = "yes" | "no" | "unknown";
export type FinancialQueryIntent =
  | "query_summary"
  | "query_available"
  | "query_reimbursements"
  | "simulate_expense";

export interface FinancialDraft {
  source: FinancialDraftSource;
  kind: "expense" | "income" | "query";
  amountArs: number | null;
  categorySlug: string | null;
  description: string | null;
  queryIntent: FinancialQueryIntent | null;
  reimbursement: ReimbursementIntent;
  /** Financial writes always require a separate, explicit Telegram confirmation. */
  requiresConfirmation: boolean;
}

export type FinancialDraftResult =
  | { status: "ready"; draft: FinancialDraft }
  | { status: "incomplete"; draft: FinancialDraft; missing: Array<"amount" | "category"> }
  | { status: "clarification"; reason: "intent" | "amount"; draft: FinancialDraft };

export interface FinancialDraftCandidate {
  source: FinancialDraftSource;
  intent: "transaction" | "query" | "unknown";
  amountArs?: number | null;
  categorySlug?: string | null;
  description?: string | null;
  queryIntent?: FinancialQueryIntent | null;
  /** Retained as input compatibility only; model output never decides consent. */
  modelRequiresReimbursement?: boolean;
  text?: string;
}

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeCategory(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || null;
}

function reimbursementIntent(text: string): ReimbursementIntent {
  const normalized = normalizeText(text);
  const mentionsReimbursement = /\b(reintegros?|reembolsos?)\b/.test(normalized);
  if (!mentionsReimbursement) return "unknown";

  if (/\b(?:sin|no\s+(?:quiero|necesito|solicito|pidas?|pedir|hace\s+falta))\s+(?:el\s+)?(?:reintegros?|reembolsos?)\b/.test(normalized)) {
    return "no";
  }
  if (/\b(?:no\s*,?\s*)?(?:quiero|necesito|solicito|pedir|con)\s+(?:el\s+)?(?:reintegros?|reembolsos?)\b/.test(normalized) || mentionsReimbursement) {
    return "yes";
  }
  return "unknown";
}

function isIncome(text: string, categorySlug: string | null): boolean {
  if (categorySlug === "ingreso" || categorySlug === "ingresos") return true;
  return /\b(ingreso|ingresos|cobre|cobrar|cobro|sueldo|salario|honorarios|aguinaldo|me\s+pagaron|me\s+depositaron|recibi|recibir)\b/.test(normalizeText(text));
}

export function createFinancialDraft(candidate: FinancialDraftCandidate): FinancialDraftResult {
  const text = candidate.text ?? "";
  const categorySlug = normalizeCategory(candidate.categorySlug);
  const amount = candidate.amountArs ?? null;

  if (candidate.intent === "query") {
    const draft: FinancialDraft = {
      source: candidate.source,
      kind: "query",
      amountArs: Number.isFinite(amount) ? amount : null,
      categorySlug,
      description: candidate.description?.trim() || null,
      queryIntent: candidate.queryIntent ?? null,
      reimbursement: "unknown",
      requiresConfirmation: false,
    };
    return { status: "ready", draft };
  }

  if (candidate.intent !== "transaction") {
    return {
      status: "clarification",
      reason: "intent",
      draft: {
        source: candidate.source,
        kind: "expense",
        amountArs: null,
        categorySlug,
        description: candidate.description?.trim() || null,
        queryIntent: null,
        reimbursement: "unknown",
        requiresConfirmation: true,
      },
    };
  }

  const validAmount = amount === null || (Number.isFinite(amount) && amount > 0);
  const draft: FinancialDraft = {
    source: candidate.source,
    kind: isIncome(text, categorySlug) ? "income" : "expense",
    amountArs: validAmount ? amount : null,
    categorySlug,
    description: candidate.description?.trim() || null,
    queryIntent: null,
    reimbursement: isIncome(text, categorySlug) ? "unknown" : reimbursementIntent(text),
    requiresConfirmation: true,
  };

  if (!validAmount) return { status: "clarification", reason: "amount", draft };

  const missing: Array<"amount" | "category"> = [];
  if (amount === null) missing.push("amount");
  if (!categorySlug) missing.push("category");
  return missing.length > 0
    ? { status: "incomplete", draft, missing }
    : { status: "ready", draft };
}
