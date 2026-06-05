// lib/telegram/splits/commands/activar.ts
import { db } from "@/lib/db/client";
import { users, temp_users, split_sessions, split_session_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

interface TelegramChatMember {
  user: {
    id: number;
    is_bot: boolean;
    username?: string;
    first_name: string;
    last_name?: string;
  };
  status: string;
}

/**
 * Calls getChatAdministrators and registers all non-bot admins as session members.
 * This covers the case where all group members are admins (common in small friend groups).
 */
async function registerAdminsAsMembers(chatId: string, sessionId: string, nowMs: number): Promise<number> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return 0;

  let admins: TelegramChatMember[] = [];
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getChatAdministrators?chat_id=${chatId}`);
    if (!res.ok) return 0;
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) return 0;
    admins = data.result;
  } catch {
    return 0;
  }

  let registered = 0;
  for (const admin of admins) {
    if (admin.user.is_bot) continue;

    const telegramUserId = String(admin.user.id);

    const hermesUser = await db.query.users.findFirst({
      where: eq(users.telegram_user_id, telegramUserId),
    });

    if (hermesUser) {
      await db.insert(split_session_members).values({
        session_id: sessionId,
        user_id: hermesUser.id,
        temp_user_id: null,
        joined_at: nowMs,
      }).onConflictDoNothing();
    } else {
      let tempUser = await db.query.temp_users.findFirst({
        where: eq(temp_users.telegram_user_id, telegramUserId),
      });

      if (!tempUser) {
        const tempId = randomUUID();
        await db.insert(temp_users).values({
          id: tempId,
          telegram_user_id: telegramUserId,
          telegram_username: admin.user.username ?? null,
          first_name: admin.user.first_name,
          last_name: admin.user.last_name ?? null,
          created_at: nowMs,
          upgraded_to: null,
        }).onConflictDoNothing();
        tempUser = await db.query.temp_users.findFirst({
          where: eq(temp_users.telegram_user_id, telegramUserId),
        });
      }

      if (tempUser) {
        await db.insert(split_session_members).values({
          session_id: sessionId,
          user_id: null,
          temp_user_id: tempUser.id,
          joined_at: nowMs,
        }).onConflictDoNothing();
      }
    }
    registered++;
  }
  return registered;
}

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

  // Register all group admins (covers the case where everyone is admin)
  const adminCount = await registerAdminsAsMembers(chatId, sessionId, nowMs);
  const membersNote = adminCount > 1
    ? `👥 ${adminCount} participantes detectados (admins del grupo).`
    : `👥 1 participante registrado. Los demás se suman al enviar cualquier mensaje.`;

  return [
    `✅ <b>¡Hermes activado!</b>`,
    ``,
    `Sesión "<b>${sessionName}</b>" creada.`,
    `${membersNote}`,
    ``,
    `<b>Comandos disponibles:</b>`,
    `/compartido [monto] [descripción] — nuevo gasto`,
    `/balances — ver deudas actuales`,
    `/cerrar — finalizar sesión`,
    `/ayuda — ver todos los comandos`,
  ].join("\n");
}
