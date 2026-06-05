// lib/telegram/splits/commands/pague.ts
import { db } from "@/lib/db/client";
import { users, temp_users, split_sessions, splits, split_payers, split_items, split_payments } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { calculateSessionBalances } from "@/lib/splits/balances";
import { setConversationState } from "../conversation-state";
import type { TelegramResponse } from "../telegram-api";
import { buildInlineKeyboard } from "../telegram-api";

type HermesDisplayUser = Pick<typeof users.$inferSelect, "username" | "name">;
type TempDisplayUser = Pick<typeof temp_users.$inferSelect, "telegram_username" | "first_name">;

const getHermesDisplayName = (user: HermesDisplayUser): string => user.username || user.name;
const getTempDisplayName = (tempUser: TempDisplayUser): string => {
  if (tempUser.telegram_username) {
    return tempUser.telegram_username.startsWith("@") ? tempUser.telegram_username : `@${tempUser.telegram_username}`;
  }
  return tempUser.first_name;
};

/**
 * Handles /pague command.
 * Shows list of debts and allows the user to confirm payment.
 */
export async function handlePague(chatId: string, telegramUserId: string): Promise<TelegramResponse> {
  const session = await db.query.split_sessions.findFirst({
    where: and(
      eq(split_sessions.telegram_chat_id, chatId),
      eq(split_sessions.status, "open")
    ),
  });
  if (!session) {
    return {
      text: "❌ No hay sesión activa. Usá /activar para crear una.",
    };
  }

  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });
  if (!hermesUser) {
    return {
      text: "❌ No tenés cuenta en Hermes. Registrate en la web.",
    };
  }

  const splitsRows = await db.query.splits.findMany({
    where: and(
      eq(splits.session_id, session.id),
      eq(splits.status, "active")
    ),
  });

  if (splitsRows.length === 0) {
    return {
      text: "❌ No hay gastos registrados en esta sesión.",
    };
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

  const myDebts = summary.debts.filter(d => d.from.userId === hermesUser.id);

  if (myDebts.length === 0) {
    return {
      text: "✅ No tenés deudas pendientes en esta sesión.",
    };
  }

  const creditorIds = [...new Set(myDebts.map(d => d.to.userId).filter(Boolean) as string[])];
  const tempCreditorIds = [...new Set(myDebts.map(d => d.to.tempUserId).filter(Boolean) as string[])];
  const [creditorsData, tempCreditorsData] = await Promise.all([
    creditorIds.length > 0
      ? db.select({ id: users.id, name: users.name, username: users.username })
          .from(users)
          .where(inArray(users.id, creditorIds))
      : Promise.resolve([]),
    tempCreditorIds.length > 0
      ? db.select({ id: temp_users.id, telegram_username: temp_users.telegram_username, first_name: temp_users.first_name })
          .from(temp_users)
          .where(inArray(temp_users.id, tempCreditorIds))
      : Promise.resolve([]),
  ]);

  const nameMap = new Map<string, string>();
  const tempNameMap = new Map<string, string>();
  for (const user of creditorsData) nameMap.set(user.id, getHermesDisplayName(user));
  for (const tempUser of tempCreditorsData) tempNameMap.set(tempUser.id, getTempDisplayName(tempUser));

  const lines = [
    "💰 Tus deudas pendientes:",
    ...myDebts.map(d => {
      const creditorName = d.to.userId
        ? (nameMap.get(d.to.userId) ?? "Alguien")
        : (tempNameMap.get(d.to.tempUserId ?? "") ?? "Alguien");
      const amount = d.amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });
      return `• <b>${creditorName}</b>: $${amount}`;
    }),
    "",
    "¿A quién le pagaste?",
  ];

  const buttons = myDebts.map(d => {
    const isTempCreditor = !d.to.userId && d.to.tempUserId;
    const creditorName = isTempCreditor
      ? (tempNameMap.get(d.to.tempUserId!) ?? "Alguien")
      : (nameMap.get(d.to.userId!) ?? "Alguien");
    const amount = d.amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });
    const callbackData = isTempCreditor
      ? `pague_select:temp:${d.to.tempUserId}`
      : `pague_select:user:${d.to.userId}`;
    return [{ text: `${creditorName} $${amount}`, callback_data: callbackData }];
  });

  const keyboard = buildInlineKeyboard(buttons);

  await setConversationState(chatId, telegramUserId, {
    step: "pague_select",
    data: { session_id: session.id },
  });

  return {
    text: lines.join("\n"),
    replyMarkup: keyboard,
  };
}

export async function handlePagueSelect(
  chatId: string,
  telegramUserId: string,
  data: string
): Promise<TelegramResponse> {
  const rawCreditor = data.replace("pague_select:", "");
  let creditorUserId: string | undefined;
  let creditorTempId: string | undefined;

  if (rawCreditor.startsWith("user:")) {
    creditorUserId = rawCreditor.replace("user:", "");
  } else if (rawCreditor.startsWith("temp:")) {
    creditorTempId = rawCreditor.replace("temp:", "");
  } else {
    creditorUserId = rawCreditor;
  }

  if (!creditorUserId && !creditorTempId) {
    return {
      text: "❌ Datos inválidos.",
      edit: true,
    };
  }

  const session = await db.query.split_sessions.findFirst({
    where: and(
      eq(split_sessions.telegram_chat_id, chatId),
      eq(split_sessions.status, "open")
    ),
  });

  if (!session) {
    return {
      text: "❌ Sesión no encontrada.",
      edit: true,
    };
  }

  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });

  if (!hermesUser) {
    return {
      text: "❌ No tenés cuenta en Hermes.",
      edit: true,
    };
  }

  const splitsRows = await db.query.splits.findMany({
    where: and(
      eq(splits.session_id, session.id),
      eq(splits.status, "active")
    ),
  });

  if (splitsRows.length === 0) {
    return {
      text: "❌ No hay gastos registrados en esta sesión.",
      edit: true,
    };
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

  const myDebts = summary.debts.filter(d => d.from.userId === hermesUser.id);
  const debt = myDebts.find(d => creditorUserId
    ? d.to.userId === creditorUserId
    : d.to.tempUserId === creditorTempId);

  if (!debt) {
    return {
      text: "❌ No tenés deudas con esa persona o ya fue saldada.",
      edit: true,
    };
  }

  let creditorName: string;

  if (creditorUserId) {
    const creditor = await db.query.users.findFirst({ where: eq(users.id, creditorUserId) });
    if (!creditor) {
      return {
        text: "❌ Usuario no encontrado.",
        edit: true,
      };
    }
    creditorName = getHermesDisplayName(creditor);
  } else {
    const creditor = await db.query.temp_users.findFirst({ where: eq(temp_users.id, creditorTempId!) });
    if (!creditor) {
      return {
        text: "❌ Usuario no encontrado.",
        edit: true,
      };
    }
    creditorName = getTempDisplayName(creditor);
  }

  const state = {
    step: "pague_confirm" as const,
    debt_amount: debt.amount,
    creditor_user_id: creditorUserId,
    creditor_temp_id: creditorTempId,
    creditor_name: creditorName,
    session_id: session.id,
  };

  await setConversationState(chatId, telegramUserId, { step: state.step, data: state });

  const formattedAmount = debt.amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });

  const keyboard = buildInlineKeyboard([
    [{ text: "✅ Confirmar", callback_data: "pague_confirm:yes" }],
    [{ text: "❌ Cancelar", callback_data: "pague_confirm:cancel" }],
  ]);

  return {
    text: `¿Confirmás que pagaste $${formattedAmount} a ${creditorName}?`,
    replyMarkup: keyboard,
    edit: true,
  };
}
