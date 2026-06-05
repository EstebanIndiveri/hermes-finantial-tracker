// lib/telegram/splits/handler.ts
import { handleActivar } from "./commands/activar";
import { getConversationState, clearConversationState } from "./conversation-state";

interface TelegramGroupMessage {
  chat: { id: number; type: string };
  from: { id: number; username?: string; first_name: string; last_name?: string };
  text?: string;
  caption?: string;
}

/**
 * Routes group messages to the appropriate split command handler.
 * Returns the response text if a command was handled, or null if not.
 */
export async function handleSplitGroupMessage(message: TelegramGroupMessage): Promise<string | null> {
  const chatId = String(message.chat.id);
  const from = message.from;
  const telegramUserId = String(from.id);
  const text = (message.text ?? message.caption ?? "").trim().toLowerCase();

  if (text.startsWith("/activar")) {
    return handleActivar(chatId, telegramUserId, from.username, from.first_name, from.last_name);
  }

  if (text === "/balances") {
    return "📊 <b>Balances</b>\n\nFuncionalidad disponible próximamente. Visitá el dashboard para ver los balances actuales.";
  }

  if (text === "/ayuda" || text === "/help") {
    return [
      "🤖 <b>Comandos de Hermes Compartidos</b>",
      "",
      "/activar — activar Hermes en este grupo",
      "/compartido [monto] [descripción] — registrar gasto compartido",
      "/pague @usuario — confirmar que pagaste una deuda",
      "/balances — ver balances actuales del grupo",
      "/cerrar — cerrar la sesión actual",
    ].join("\n");
  }

  // Check for active conversation state (multi-step flows)
  const state = await getConversationState(chatId, telegramUserId);
  if (state) {
    await clearConversationState(chatId, telegramUserId);
  }

  return null; // not handled
}
