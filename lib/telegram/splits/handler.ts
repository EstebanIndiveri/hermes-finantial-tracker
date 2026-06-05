// lib/telegram/splits/handler.ts
import { handleActivar } from "./commands/activar";
import { handleCompartido } from "./commands/compartido";
import { handleBalances } from "./commands/balances";
import { handleCerrar } from "./commands/cerrar";

interface TelegramGroupMessage {
  chat: { id: number; type: string; title?: string };
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
  const chatTitle = message.chat.title;
  const from = message.from;
  const telegramUserId = String(from.id);
  const rawText = (message.text ?? message.caption ?? "").trim();
  const text = rawText.toLowerCase();

  if (text.startsWith("/activar")) {
    return handleActivar(chatId, chatTitle, telegramUserId, from.username, from.first_name, from.last_name);
  }

  if (text.startsWith("/compartido")) {
    return handleCompartido(chatId, telegramUserId, rawText);
  }

  if (text === "/balances") {
    return handleBalances(chatId);
  }

  if (text === "/cerrar") {
    return handleCerrar(chatId, telegramUserId);
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

  return null; // not handled
}
