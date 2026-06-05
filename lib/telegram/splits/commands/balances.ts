// lib/telegram/splits/commands/balances.ts
import { db } from "@/lib/db/client";
import { users, temp_users, split_sessions, split_session_members, splits, split_payers, split_items, split_payments } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { calculateSessionBalances } from "@/lib/splits/balances";

/**
 * Handles /balances command.
 * Shows current debt summary for the active session in this group.
 */
export async function handleBalances(chatId: string): Promise<string> {
  const session = await db.query.split_sessions.findFirst({
    where: and(
      eq(split_sessions.telegram_chat_id, chatId),
      eq(split_sessions.status, "open")
    ),
  });
  if (!session) {
    return "❌ No hay sesión activa. Usá /activar para crear una.";
  }

  // Collect all splits for this session
  const splitsRows = await db.query.splits.findMany({
    where: and(
      eq(splits.session_id, session.id),
      eq(splits.status, "active")
    ),
  });

  if (splitsRows.length === 0) {
    return `📊 <b>${session.name}</b>\n\nNo hay gastos registrados aún.\nUsá <code>/compartido [monto] [descripción]</code> para agregar uno.`;
  }

  const splitIds = splitsRows.map(s => s.id);

  const [payersRows, itemsRows, paymentsRows] = await Promise.all([
    db.select().from(split_payers).where(inArray(split_payers.split_id, splitIds)),
    db.select().from(split_items).where(inArray(split_items.split_id, splitIds)),
    db.select().from(split_payments).where(eq(split_payments.session_id, session.id)),
  ]);

  const summary = calculateSessionBalances(
    payersRows.map(p => ({ userId: p.user_id ?? undefined, tempUserId: p.temp_user_id ?? undefined, amountPaid: p.amount_paid })),
    itemsRows.map(i => ({ userId: i.user_id ?? undefined, tempUserId: i.temp_user_id ?? undefined, amountOwed: i.amount_owed })),
    paymentsRows.map(p => ({
      payerUserId: p.payer_user_id ?? undefined,
      payerTempId: p.payer_temp_id ?? undefined,
      payeeUserId: p.payee_user_id ?? undefined,
      payeeTempId: p.payee_temp_id ?? undefined,
      amount: p.amount,
    }))
  );

  if (summary.isSettled) {
    const total = splitsRows.reduce((acc, s) => acc + s.total_amount, 0);
    return `📊 <b>${session.name}</b>\n\n✅ <b>Todo saldado</b>\n\nTotal registrado: $${total.toLocaleString("es-AR", { minimumFractionDigits: 0 })} en ${splitsRows.length} gasto${splitsRows.length !== 1 ? "s" : ""}`;
  }

  // Resolve names for participants
  const userIds = [...new Set([
    ...summary.debts.map(d => d.from.userId).filter(Boolean),
    ...summary.debts.map(d => d.to.userId).filter(Boolean),
  ])] as string[];
  const tempIds = [...new Set([
    ...summary.debts.map(d => d.from.tempUserId).filter(Boolean),
    ...summary.debts.map(d => d.to.tempUserId).filter(Boolean),
  ])] as string[];

  const [usersData, tempUsersData] = await Promise.all([
    userIds.length > 0 ? db.select({ id: users.id, name: users.name, username: users.username }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
    tempIds.length > 0 ? db.select({ id: temp_users.id, first_name: temp_users.first_name }).from(temp_users).where(inArray(temp_users.id, tempIds)) : Promise.resolve([]),
  ]);

  const nameMap = new Map<string, string>();
  for (const u of usersData) nameMap.set(u.id, u.username || u.name);
  for (const t of tempUsersData) nameMap.set(t.id, t.first_name);

  const getName = (id: { userId?: string; tempUserId?: string }): string => {
    const key = id.userId ?? id.tempUserId ?? "";
    return nameMap.get(key) ?? "Alguien";
  };

  const total = splitsRows.reduce((acc, s) => acc + s.total_amount, 0);

  const lines = [
    `📊 <b>${session.name}</b>`,
    `Total: $${total.toLocaleString("es-AR", { minimumFractionDigits: 0 })} en ${splitsRows.length} gasto${splitsRows.length !== 1 ? "s" : ""}`,
    ``,
    `💸 <b>Deudas pendientes:</b>`,
    ...summary.debts.map(d =>
      `• <b>${getName(d.from)}</b> → <b>${getName(d.to)}</b>: $${d.amount.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`
    ),
  ];

  return lines.join("\n");
}
