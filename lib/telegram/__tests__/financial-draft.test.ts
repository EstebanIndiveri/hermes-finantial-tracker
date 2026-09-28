import { createFinancialDraft } from "../financial-draft";
import { buildExpenseProposalKeyboard } from "../expense-proposal";

describe("createFinancialDraft", () => {
  it.each(["command", "text", "voice", "receipt"] as const)(
    "normalizes the same confirmed expense candidate from %s",
    (source) => {
      expect(createFinancialDraft({
        source,
        intent: "transaction",
        amountArs: 23971.15,
        categorySlug: "Supermercado",
        text: "gasto supermercado",
        modelRequiresReimbursement: true,
      })).toEqual({
        status: "ready",
        draft: {
          source,
          kind: "expense",
          amountArs: 23971.15,
          categorySlug: "supermercado",
          description: null,
          queryIntent: null,
          reimbursement: "unknown",
          requiresConfirmation: true,
        },
      });
    },
  );

  it("keeps a missing amount incomplete but rejects invalid numeric amounts", () => {
    expect(createFinancialDraft({
      source: "text",
      intent: "transaction",
      amountArs: null,
      categorySlug: "supermercado",
      text: "gasté en supermercado",
    })).toMatchObject({ status: "incomplete", missing: ["amount"] });

    for (const amountArs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(createFinancialDraft({
        source: "text",
        intent: "transaction",
        amountArs,
        categorySlug: "supermercado",
        text: "gasté en supermercado",
      })).toMatchObject({ status: "clarification", reason: "amount" });
    }
  });

  it("distinguishes income from expense without inferring a negative amount", () => {
    expect(createFinancialDraft({
      source: "voice",
      intent: "transaction",
      amountArs: 300000,
      categorySlug: "ingresos",
      text: "cobré 300000 de sueldo",
    })).toMatchObject({ status: "ready", draft: { kind: "income", amountArs: 300000 } });
    expect(createFinancialDraft({
      source: "text",
      intent: "transaction",
      amountArs: 300000,
      categorySlug: "supermercado",
      text: "gasté 300000 en supermercado",
    })).toMatchObject({ status: "ready", draft: { kind: "expense", amountArs: 300000 } });
  });

  it("does not offer reimbursement consent for income proposals", () => {
    expect(buildExpenseProposalKeyboard({ editPrefix: "expense", cancelCallback: "expense:cancel", isIncome: true }))
      .toEqual({
        inline_keyboard: [
          [{ text: "✅ Registrar ingreso", callback_data: "expense:confirm" }],
          [
            { text: "💰 Editar monto", callback_data: "expense:edit_amount" },
            { text: "📂 Editar categoría", callback_data: "expense:edit_category" },
          ],
          [
            { text: "🏪 Editar comercio", callback_data: "expense:edit_merchant" },
            { text: "❌ Cancelar", callback_data: "expense:cancel" },
          ],
        ],
      });
  });

  it("represents reimbursement consent as yes, no, or unknown from user language only", () => {
    const draft = (text: string, modelRequiresReimbursement = false) => createFinancialDraft({
      source: "text",
      intent: "transaction" as const,
      amountArs: 5000,
      categorySlug: "supermercado",
      text,
      modelRequiresReimbursement,
    });

    expect(draft("gasté 5000 con reintegro")).toMatchObject({ status: "ready", draft: { reimbursement: "yes" } });
    expect(draft("gasté 5000 sin reintegro", true)).toMatchObject({ status: "ready", draft: { reimbursement: "no" } });
    expect(draft("gasté 5000, no quiero que solicites reintegro", true)).toMatchObject({ status: "ready", draft: { reimbursement: "no" } });
    expect(draft("gasté 5000, necesito solicitar reintegro")).toMatchObject({ status: "ready", draft: { reimbursement: "yes" } });
    expect(draft("gasté 5000, ¿cómo funciona el reintegro?", true)).toMatchObject({ status: "ready", draft: { reimbursement: "unknown" } });
    expect(draft("gasté 5000 en supermercado", true)).toMatchObject({ status: "ready", draft: { reimbursement: "unknown" } });
  });

  it("uses the tri-state reimbursement decision in the confirmation proposal", () => {
    const keyboard = (reimbursementIntent: "yes" | "no" | "unknown") =>
      buildExpenseProposalKeyboard({
        editPrefix: "expense",
        cancelCallback: "expense:cancel",
        reimbursementIntent,
      }).inline_keyboard;

    expect(keyboard("yes")?.slice(0, 2)).toEqual([
      [{ text: "✅ Sí, pedir reintegro", callback_data: "expense:confirm_reimbursement" }],
      [{ text: "✅ No, solo gasto", callback_data: "expense:confirm" }],
    ]);
    expect(keyboard("no")?.[0]).toEqual([
      { text: "✅ Confirmar sin reintegro", callback_data: "expense:confirm" },
    ]);
    expect(keyboard("unknown")?.slice(0, 2)).toEqual([
      [{ text: "💸 Sí, pedir reintegro", callback_data: "expense:confirm_reimbursement" }],
      [{ text: "✅ No, solo gasto", callback_data: "expense:confirm" }],
    ]);
  });

  it("keeps queries read-only and ambiguous candidates out of the write path", () => {
    expect(createFinancialDraft({ source: "text", intent: "query", text: "cuánto me queda" }))
      .toMatchObject({ status: "ready", draft: { kind: "query", requiresConfirmation: false } });
    expect(createFinancialDraft({ source: "text", intent: "unknown", text: "supermercado" }))
      .toMatchObject({ status: "clarification", reason: "intent" });
  });
});
