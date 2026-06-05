// lib/telegram/splits/commands/activar.ts
import { db } from "@/lib/db/client";
import { users, temp_users, split_sessions, split_session_members } from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://hermes-finantial-tracker.vercel.app";

/**
 * Handles /activar command in a Telegram group.
 * Creates a split session for the group and registers the activator as owner.
 * Only registered Hermes users can be session owners (temp users get a registration prompt).
 */
export async function handleActivar(
  chatId: string,
  chatTitle: string | undefined,
  telegramUserId: string,
  telegramUsername: string | undefined,
  firstName: string,
  lastName: string | undefined
): Promise<string> {
  // Check if group already has an active session
  const existing = await db.query.split_sessions.findFirst({
    where: eq(split_sessions.telegram_chat_id, chatId),
  });
  if (existing && existing.status === "open") {
    return `Este grupo ya tiene una sesión activa: <b>${existing.name}</b>\n\nUsá /balances para ver el estado o /cerrar para finalizarla.`;
  }

  // Check if telegram user is registered in Hermes
  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });

  if (!hermesUser) {
    // Register as temp_user but prompt for full registration
    let tempUser = await db.query.temp_users.findFirst({
      where: eq(temp_users.telegram_user_id, telegramUserId),
    });
    if (!tempUser) {
      const tempId = randomUUID();
      await db.insert(temp_users).values({
        id: tempId,
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername ?? null,
        first_name: firstName,
        last_name: lastName ?? null,
        created_at: Date.now(),
      });
    }
    return `Para activar Hermes en este grupo necesitás una cuenta.\n\nRegistrate gratis en:\n👉 ${APP_URL}\n\nUna vez registrado, vinculá tu cuenta de Telegram en Configuración y volvé a usar /activar`;
  }

  // Create session with registered user as owner
  const sessionId = randomUUID();
  const nowDate = new Date();
  const nowMs = nowDate.getTime();
  const dateStr = `${nowDate.getDate()}/${nowDate.getMonth() + 1}/${String(nowDate.getFullYear()).slice(-2)}`;
  const groupLabel = chatTitle ?? "Compartidos";
  const sessionName = `${groupLabel} ${dateStr}`;

  // Clear telegram_chat_id from any previous closed session to avoid unique constraint violation
  if (existing) {
    await db
      .update(split_sessions)
      .set({ telegram_chat_id: null })
      .where(eq(split_sessions.id, existing.id));
  }

  await db.insert(split_sessions).values({
    id: sessionId,
    name: sessionName,
    owner_user_id: hermesUser.id,
    telegram_chat_id: chatId,
    status: "open",
    created_at: nowMs,
  });

  await db.insert(split_session_members).values({
    session_id: sessionId,
    user_id: hermesUser.id,
    temp_user_id: null,
    joined_at: nowMs,
  });

  return `✅ <b>¡Hermes activado!</b>\n\nSesión "<b>${sessionName}</b>" creada.\n\n<b>Comandos disponibles:</b>\n/compartido [monto] [descripción] — nuevo gasto\n/balances — ver deudas actuales\n/cerrar — finalizar sesión\n/ayuda — ver todos los comandos`;
}
