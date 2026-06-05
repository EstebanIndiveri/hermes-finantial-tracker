// lib/telegram/splits/callback-handler.ts
import { db } from "@/lib/db/client";
import {
  users,
  temp_users,
  split_sessions,
  split_session_members,
  splits,
  split_payers,
  split_items,
  split_payments,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getConversationState, setConversationState, clearConversationState } from "./conversation-state";
import type { TelegramResponse } from "./telegram-api";
import { buildInlineKeyboard } from "./telegram-api";
import { handlePagueSelect } from "./commands/pague";

interface CompartidoState {
  step: "who_paid" | "participants";
  amount: number;
  description: string;
  session_id: string;
  payer_user_id?: string;
  payer_temp_user_id?: string;
  payer_name?: string;
}

interface PagueState {
  step: "pague_confirm";
  debt_amount: number;
  creditor_user_id?: string;
  creditor_temp_id?: string;
  creditor_name?: string;
  session_id: string;
}

type HermesDisplayUser = Pick<typeof users.$inferSelect, "username" | "name">;
type TempDisplayUser = Pick<typeof temp_users.$inferSelect, "telegram_username" | "first_name">;

const getHermesDisplayName = (user: HermesDisplayUser | null | undefined): string => {
  if (!user) return "Alguien";
  return user.username || user.name;
};

const getTempDisplayName = (tempUser: TempDisplayUser | null | undefined): string => {
  if (!tempUser) return "Alguien";
  if (tempUser.telegram_username) {
    return tempUser.telegram_username.startsWith("@")
      ? tempUser.telegram_username
      : `@${tempUser.telegram_username}`;
  }
  return tempUser.first_name;
};

export async function handleSplitCallback(
  chatId: string,
  telegramUserId: string,
  data: string,
  messageId?: number
): Promise<TelegramResponse | null> {
  const state = await getConversationState(chatId, telegramUserId);

  if (data.startsWith("pague_select:")) {
    if (!state || state.step !== "pague_select") {
      return {
        text: "⏱️ Esta conversación expiró o no es tuya. Usá /pague para comenzar.",
        edit: false,
      };
    }
    return handlePagueSelect(chatId, telegramUserId, data);
  }

  if (!state) {
    return {
      text: "⏱️ Esta conversación expiró. Comenzá nuevamente con el comando.",
      edit: false,
    };
  }

  if (data.startsWith("paid_by:")) {
    return handleWhoPaidCallback(chatId, telegramUserId, data, state.data as CompartidoState);
  }

  if (data.startsWith("participants:")) {
    return handleParticipantsCallback(chatId, telegramUserId, data, state.data as CompartidoState);
  }

  if (data.startsWith("pague_confirm:")) {
    return handlePagueConfirmCallback(chatId, telegramUserId, data, state.data as PagueState);
  }

  return {
    text: "❌ Acción no reconocida.",
    edit: false,
  };
}

async function handleWhoPaidCallback(
  chatId: string,
  telegramUserId: string,
  data: string,
  state: CompartidoState
): Promise<TelegramResponse> {
  const rawId = data.replace("paid_by:", "");

  if (rawId === "varios") {
    return {
      text: "💳 El flujo de múltiples pagadores no está implementado aún. Usá /compartido nuevamente seleccionando un solo pagador.",
      edit: true,
    };
  }

  let payerUserId: string | undefined;
  let payerTempUserId: string | undefined;
  let payerName: string | undefined;
  let payerExists = false;

  if (rawId.startsWith("user:")) {
    payerUserId = rawId.replace("user:", "");
    const hermesUser = await db.query.users.findFirst({
      where: eq(users.id, payerUserId),
    });
    payerExists = Boolean(hermesUser);
    payerName = getHermesDisplayName(hermesUser);
  } else if (rawId.startsWith("temp:")) {
    payerTempUserId = rawId.replace("temp:", "");
    const tempUser = await db.query.temp_users.findFirst({
      where: eq(temp_users.id, payerTempUserId),
    });
    payerExists = Boolean(tempUser);
    payerName = getTempDisplayName(tempUser);
  } else {
    payerUserId = rawId;
    const hermesUser = await db.query.users.findFirst({
      where: eq(users.id, payerUserId),
    });
    payerExists = Boolean(hermesUser);
    payerName = getHermesDisplayName(hermesUser);
  }

  if (!payerExists || !payerName) {
    await clearConversationState(chatId, telegramUserId);
    return {
      text: "❌ Usuario no encontrado.",
      edit: true,
    };
  }

  const newState: CompartidoState = {
    ...state,
    step: "participants",
    payer_user_id: payerUserId,
    payer_temp_user_id: payerTempUserId,
    payer_name: payerName,
  };
  await setConversationState(chatId, telegramUserId, { step: newState.step, data: newState });

  const formattedAmount = state.amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  const keyboard = buildInlineKeyboard([
    [{ text: "✅ Sí, todos", callback_data: "participants:all" }],
    [{ text: "➖ Quitar alguien", callback_data: "participants:exclude" }],
  ]);

  return {
    text: [
      "👥 ¿Participan todos en este gasto?",
      `${state.description} — $${formattedAmount}`,
      `(Pagó: ${payerName})`,
    ].join("\n"),
    replyMarkup: keyboard,
    edit: true,
  };
}

async function handleParticipantsCallback(
  chatId: string,
  telegramUserId: string,
  data: string,
  state: CompartidoState
): Promise<TelegramResponse> {
  if (data === "participants:exclude") {
    return {
      text: "➖ El flujo de exclusión no está implementado aún. Por ahora, usá 'Sí, todos'.",
      edit: true,
    };
  }

  if (data !== "participants:all") {
    return {
      text: "❌ Opción no reconocida.",
      edit: true,
    };
  }

  if (!state.payer_user_id && !state.payer_temp_user_id) {
    await clearConversationState(chatId, telegramUserId);
    return {
      text: "❌ Falta información del pagador.",
      edit: true,
    };
  }

  await clearConversationState(chatId, telegramUserId);

  const session = await db.query.split_sessions.findFirst({
    where: eq(split_sessions.id, state.session_id),
  });

  if (!session) {
    return {
      text: "❌ Sesión no encontrada.",
      edit: true,
    };
  }

  const membersRows = await db.query.split_session_members.findMany({
    where: eq(split_session_members.session_id, session.id),
  });
  // Deduplicate — guards against missing DB unique constraints
  const userMemberIds = [...new Set(membersRows.filter(m => m.user_id).map(m => m.user_id as string))];
  const tempMemberIds = [...new Set(membersRows.filter(m => m.temp_user_id).map(m => m.temp_user_id as string))];

  if (state.payer_user_id && !userMemberIds.includes(state.payer_user_id)) {
    await db.insert(split_session_members).values({
      session_id: session.id,
      user_id: state.payer_user_id,
      temp_user_id: null,
      joined_at: Date.now(),
    }).onConflictDoNothing();
    userMemberIds.push(state.payer_user_id);
  }

  if (state.payer_temp_user_id && !tempMemberIds.includes(state.payer_temp_user_id)) {
    await db.insert(split_session_members).values({
      session_id: session.id,
      user_id: null,
      temp_user_id: state.payer_temp_user_id,
      joined_at: Date.now(),
    }).onConflictDoNothing();
    tempMemberIds.push(state.payer_temp_user_id);
  }

  const totalMembers = userMemberIds.length + tempMemberIds.length;
  if (totalMembers === 0) {
    return {
      text: "❌ No hay participantes en esta sesión.",
      edit: true,
    };
  }

  const sharePerPerson = Math.round((state.amount / totalMembers) * 100) / 100;
  const splitId = randomUUID();
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx.insert(splits).values({
      id: splitId,
      session_id: session.id,
      description: state.description,
      total_amount: state.amount,
      split_type: "equal",
      status: "active",
      created_by_user_id: state.payer_user_id ?? null,
      created_by_temp_id: state.payer_temp_user_id ?? null,
      created_at: now,
    });

    await tx.insert(split_payers).values({
      id: randomUUID(),
      split_id: splitId,
      user_id: state.payer_user_id ?? null,
      temp_user_id: state.payer_temp_user_id ?? null,
      amount_paid: state.amount,
    });

    const itemValues = [
      ...userMemberIds.map((userId) => ({
        id: randomUUID(),
        split_id: splitId,
        user_id: userId,
        temp_user_id: null,
        amount_owed: sharePerPerson,
        percentage: null,
      })),
      ...tempMemberIds.map((tempUserId) => ({
        id: randomUUID(),
        split_id: splitId,
        user_id: null,
        temp_user_id: tempUserId,
        amount_owed: sharePerPerson,
        percentage: null,
      })),
    ];

    if (itemValues.length > 0) {
      await tx.insert(split_items).values(itemValues);
    }
  });

  const [usersData, tempUsersData] = await Promise.all([
    userMemberIds.length > 0
      ? db.select({ id: users.id, name: users.name, username: users.username })
          .from(users)
          .where(inArray(users.id, userMemberIds))
      : Promise.resolve([]),
    tempMemberIds.length > 0
      ? db.select({ id: temp_users.id, first_name: temp_users.first_name, telegram_username: temp_users.telegram_username })
          .from(temp_users)
          .where(inArray(temp_users.id, tempMemberIds))
      : Promise.resolve([]),
  ]);

  const userNameMap = new Map<string, string>();
  const tempNameMap = new Map<string, string>();

  for (const user of usersData) {
    userNameMap.set(user.id, user.username || user.name);
  }

  for (const tempUser of tempUsersData) {
    tempNameMap.set(tempUser.id, tempUser.telegram_username ? getTempDisplayName(tempUser) : tempUser.first_name);
  }

  const payerName = state.payer_name
    ?? (state.payer_user_id ? userNameMap.get(state.payer_user_id) : undefined)
    ?? (state.payer_temp_user_id ? tempNameMap.get(state.payer_temp_user_id) : undefined)
    ?? "Alguien";

  const debtLines = [
    ...userMemberIds
      .filter((userId) => userId !== state.payer_user_id)
      .map((userId) => `• ${userNameMap.get(userId) ?? "Alguien"} debe $${sharePerPerson.toLocaleString("es-AR", { minimumFractionDigits: 0 })} a ${payerName}`),
    ...tempMemberIds
      .filter((tempUserId) => tempUserId !== state.payer_temp_user_id)
      .map((tempUserId) => `• ${tempNameMap.get(tempUserId) ?? "Alguien"} debe $${sharePerPerson.toLocaleString("es-AR", { minimumFractionDigits: 0 })} a ${payerName}`),
  ];

  const formattedAmount = state.amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  const formattedShare = sharePerPerson.toLocaleString("es-AR", { minimumFractionDigits: 0 });

  return {
    text: [
      `✅ <b>${state.description}</b> — $${formattedAmount}`,
      ``,
      `💸 Pagó: <b>${payerName}</b>`,
      `👥 Dividido entre ${totalMembers}: <b>$${formattedShare} c/u</b>`,
      ...(debtLines.length > 0 ? [``, `💰 <b>Deudas:</b>`, ...debtLines] : []),
      ``,
      `Usá /balances para ver el estado.`,
    ].join("\n"),
    edit: true,
  };
}

async function handlePagueConfirmCallback(
  chatId: string,
  telegramUserId: string,
  data: string,
  state: PagueState
): Promise<TelegramResponse> {
  const action = data.replace("pague_confirm:", "");

  if (action === "cancel") {
    await clearConversationState(chatId, telegramUserId);
    return {
      text: "❌ Cancelado.",
      edit: true,
    };
  }

  if (action !== "yes") {
    return {
      text: "❌ Opción no reconocida.",
      edit: true,
    };
  }

  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });

  if (!hermesUser) {
    await clearConversationState(chatId, telegramUserId);
    return {
      text: "❌ No tenés cuenta en Hermes.",
      edit: true,
    };
  }

  const session = await db.query.split_sessions.findFirst({
    where: eq(split_sessions.id, state.session_id),
  });

  if (!session) {
    await clearConversationState(chatId, telegramUserId);
    return {
      text: "❌ Sesión no encontrada.",
      edit: true,
    };
  }

  if (!state.creditor_user_id && !state.creditor_temp_id) {
    await clearConversationState(chatId, telegramUserId);
    return {
      text: "❌ Falta información del acreedor.",
      edit: true,
    };
  }

  await db.insert(split_payments).values({
    id: randomUUID(),
    session_id: session.id,
    payer_user_id: hermesUser.id,
    payer_temp_id: null,
    payee_user_id: state.creditor_user_id ?? null,
    payee_temp_id: state.creditor_temp_id ?? null,
    amount: state.debt_amount,
    method: "manual",
    receipt_image_url: null,
    ocr_raw_text: null,
    confirmed_at: Date.now(),
    telegram_update_id: null,
  });

  await clearConversationState(chatId, telegramUserId);

  const creditorName = state.creditor_name
    ?? (state.creditor_user_id
      ? getHermesDisplayName(await db.query.users.findFirst({ where: eq(users.id, state.creditor_user_id) }))
      : getTempDisplayName(await db.query.temp_users.findFirst({ where: eq(temp_users.id, state.creditor_temp_id!) })));

  const formattedAmount = state.debt_amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });

  return {
    text: [
      `✅ Pago registrado`,
      ``,
      `💰 <b>$${formattedAmount}</b> a <b>${creditorName}</b>`,
      ``,
      `Usá /balances para ver el estado actualizado.`,
    ].join("\n"),
    edit: true,
  };
}
