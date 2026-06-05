// lib/telegram/splits/commands/compartido.ts
import { db } from "@/lib/db/client";
import { users, split_sessions, split_session_members, splits, split_payers, split_items } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Handles /compartido [monto] [descripción] command.
 * Registers a shared expense in the active session for this group.
 * The sender is the payer; cost is split equally among all session members.
 */
export async function handleCompartido(
  chatId: string,
  telegramUserId: string,
  rawText: string
): Promise<string> {
  // Parse: /compartido 5000 sushi tepayaki
  const parts = rawText.trim().split(/\s+/);
  const amountStr = parts[1];
  const description = parts.slice(2).join(" ") || "Gasto compartido";

  const amount = parseFloat(amountStr?.replace(",", ".") ?? "");
  if (!amountStr || isNaN(amount) || amount <= 0) {
    return "❌ Formato incorrecto. Usá:\n<code>/compartido [monto] [descripción]</code>\nEjemplo: <code>/compartido 5000 sushi tepayaki</code>";
  }

  // Find active session for this group
  const session = await db.query.split_sessions.findFirst({
    where: and(
      eq(split_sessions.telegram_chat_id, chatId),
      eq(split_sessions.status, "open")
    ),
  });
  if (!session) {
    return "❌ No hay sesión activa en este grupo. Usá /activar para crear una.";
  }

  // Resolve the sender's Hermes user
  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });
  if (!hermesUser) {
    return "❌ No tenés cuenta en Hermes. Registrate en la web para registrar gastos.";
  }

  // Get all registered members of the session
  const membersRows = await db.query.split_session_members.findMany({
    where: eq(split_session_members.session_id, session.id),
  });
  const memberUserIds = membersRows.map(m => m.user_id).filter(Boolean) as string[];

  // Ensure payer is a member; auto-join if not
  if (!memberUserIds.includes(hermesUser.id)) {
    await db.insert(split_session_members).values({
      session_id: session.id,
      user_id: hermesUser.id,
      temp_user_id: null,
      joined_at: Date.now(),
    }).onConflictDoNothing();
    memberUserIds.push(hermesUser.id);
  }

  const memberCount = memberUserIds.length;
  const sharePerPerson = Math.round((amount / memberCount) * 100) / 100;

  const splitId = randomUUID();
  const now = Date.now();

  // Insert the split
  await db.insert(splits).values({
    id: splitId,
    session_id: session.id,
    description,
    total_amount: amount,
    split_type: "equal",
    status: "active",
    created_by_user_id: hermesUser.id,
    created_at: now,
  });

  // Payer record
  await db.insert(split_payers).values({
    id: randomUUID(),
    split_id: splitId,
    user_id: hermesUser.id,
    temp_user_id: null,
    amount_paid: amount,
  });

  // Items — one per member
  const itemValues = memberUserIds.map(uid => ({
    id: randomUUID(),
    split_id: splitId,
    user_id: uid,
    temp_user_id: null,
    amount_owed: sharePerPerson,
    percentage: null,
  }));
  for (const item of itemValues) {
    await db.insert(split_items).values(item);
  }

  const formattedAmount = amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  const formattedShare = sharePerPerson.toLocaleString("es-AR", { minimumFractionDigits: 0 });

    return [
    `✅ <b>${description}</b> — $${formattedAmount}`,
    ``,
    `💸 Pagó: <b>${hermesUser.username || hermesUser.name || "vos"}</b>`,
    `👥 Dividido en ${memberCount} personas: <b>$${formattedShare} c/u</b>`,
    ``,
    `Usá /balances para ver el estado de la sesión.`,
  ].join("\n");
}
