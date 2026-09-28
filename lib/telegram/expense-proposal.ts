import { buildPersonalKeyboard, type InlineKeyboardMarkup } from "./send-message";
import type { ReimbursementIntent } from "./financial-draft";

/**
 * All personal expense sources must ask for reimbursement consent before a
 * writer runs. Extraction may suggest intent, but only this explicit choice
 * controls whether the request is persisted.
 */
export function buildExpenseProposalKeyboard(
  options: {
    editPrefix: "expense" | "receipt";
    cancelCallback: string;
    isIncome?: boolean;
    reimbursementIntent?: ReimbursementIntent;
  },
): InlineKeyboardMarkup {
  const confirmPrefix = options.editPrefix === "receipt" ? "receipt" : "expense";
  const confirmationRow = options.isIncome
    ? [{ text: "✅ Registrar ingreso", callback_data: `${confirmPrefix}:confirm` }]
    : options.reimbursementIntent === "no"
      ? [{ text: "✅ Confirmar sin reintegro", callback_data: `${confirmPrefix}:confirm` }]
      : options.reimbursementIntent === "yes"
        ? [
            { text: "✅ Confirmar + reintegro", callback_data: `${confirmPrefix}:confirm_reimbursement` },
            { text: "✅ Confirmar solo gasto", callback_data: `${confirmPrefix}:confirm` },
          ]
    : [
        { text: "💸 Gasto + reintegro", callback_data: `${confirmPrefix}:confirm_reimbursement` },
        { text: "✅ Solo gasto", callback_data: `${confirmPrefix}:confirm` },
      ];
  return buildPersonalKeyboard([
    confirmationRow,
    options.editPrefix === "receipt"
      ? [
          { text: "💰 Editar monto", callback_data: "receipt:edit_amount" },
          { text: "📂 Editar categoría", callback_data: "receipt:edit_category" },
        ]
      : [
          { text: "💰 Editar monto", callback_data: "expense:edit_amount" },
          { text: "📂 Editar categoría", callback_data: "expense:edit_category" },
        ],
    options.editPrefix === "receipt"
      ? [
          { text: "🏪 Editar comercio", callback_data: "receipt:edit_merchant" },
          { text: "❌ Cancelar", callback_data: options.cancelCallback },
        ]
      : [
          { text: "🏪 Editar comercio", callback_data: "expense:edit_merchant" },
          { text: "❌ Cancelar", callback_data: options.cancelCallback },
        ],
  ]);
}
