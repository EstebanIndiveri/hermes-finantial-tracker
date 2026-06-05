// lib/telegram/splits/commands/cerrar.ts
import { db } from "@/lib/db/client";
import { users, split_sessions, splits } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Handles /cerrar command in a Telegram group.
 * Closes the active split session for this group.
 * Only the session owner can close it.
 */
export async function handleCerrar(
  chatId: string,
  telegramUserId: string
): Promise<string> {
  const session = await db.query.split_sessions.findFirst({
    where: and(
      eq(split_sessions.telegram_chat_id, chatId),
      eq(split_sessions.status, "open")
    ),
  });

  if (!session) {
    return "No hay ninguna sesión activa en este grupo.";
  }

  // Check the requesting user is the session owner
  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });

  if (!hermesUser) {
    return "❌ No tenés cuenta en Hermes. Solo el dueño de la sesión puede cerrarla.";
  }

  if (session.owner_user_id !== hermesUser.id) {
    return "❌ Solo el dueño de la sesión puede cerrarla.";
  }

  // Count splits for summary
  const splitsRows = await db.query.splits.findMany({
    where: and(
      eq(splits.session_id, session.id),
      eq(splits.status, "active")
    ),
  });
  const total = splitsRows.reduce((acc, s) => acc + s.total_amount, 0);

  await db
    .update(split_sessions)
    .set({ status: "closed", closed_at: Date.now() })
    .where(eq(split_sessions.id, session.id));

  const formattedTotal = total.toLocaleString("es-AR", { minimumFractionDigits: 0 });

  return [
    `🔒 <b>Sesión cerrada: ${session.name}</b>`,
    ``,
    `Total: $${formattedTotal} en ${splitsRows.length} gasto${splitsRows.length !== 1 ? "s" : ""}`,
    ``,
    `Podés ver el resumen completo en el dashboard. Usá /activar para crear una nueva sesión.`,
  ].join("\n");
}
