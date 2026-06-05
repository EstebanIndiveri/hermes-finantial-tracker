// lib/telegram/splits/callback-handler.ts
import { db } from "@/lib/db/client";
import {
  users,
  split_sessions,
  split_session_members,
  splits,
  split_payers,
  split_items,
  split_payments,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getConversationState, setConversationState, clearConversationState } from "./conversation-state";
import type { TelegramResponse } from "./telegram-api";
import { buildInlineKeyboard } from "./telegram-api";
import { calculateSessionBalances } from "@/lib/splits/balances";
import { handlePagueSelect } from "./commands/pague";

interface CompartidoState {
  step: "who_paid" | "participants";
  amount: number;
  description: string;
  session_id: string;
  payer_user_id?: string;
}

interface PagueState {
  step: "pague_confirm";
  debt_amount: number;
  creditor_user_id: string;
  session_id: string;
}

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
  const payerUserId = data.replace("paid_by:", "");

  if (payerUserId === "varios") {
    return {
      text: "💳 El flujo de múltiples pagadores no está implementado aún. Usá /compartido nuevamente seleccionando un solo pagador.",
      edit: true,
    };
  }

  const hermesUser = await db.query.users.findFirst({
    where: eq(users.id, payerUserId),
  });

  if (!hermesUser) {
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
  };
  await setConversationState(chatId, telegramUserId, { step: newState.step, data: newState });

  const formattedAmount = state.amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  const payerName = hermesUser.username || hermesUser.name;

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

  if (!state.payer_user_id) {
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
  const memberUserIds = membersRows.map(m => m.user_id).filter(Boolean) as string[];

  if (!memberUserIds.includes(state.payer_user_id)) {
    await db.insert(split_session_members).values({
      session_id: session.id,
      user_id: state.payer_user_id,
      temp_user_id: null,
      joined_at: Date.now(),
    }).onConflictDoNothing();
    memberUserIds.push(state.payer_user_id);
  }

  const memberCount = memberUserIds.length;
  const sharePerPerson = Math.round((state.amount / memberCount) * 100) / 100;

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
      created_by_user_id: state.payer_user_id,
      created_at: now,
    });

    await tx.insert(split_payers).values({
      id: randomUUID(),
      split_id: splitId,
      user_id: state.payer_user_id,
      temp_user_id: null,
      amount_paid: state.amount,
    });

    const itemValues = memberUserIds.map(uid => ({
      id: randomUUID(),
      split_id: splitId,
      user_id: uid,
      temp_user_id: null,
      amount_owed: sharePerPerson,
      percentage: null,
    }));
    for (const item of itemValues) {
      await tx.insert(split_items).values(item);
    }
  });

  const payer = await db.query.users.findFirst({
    where: eq(users.id, state.payer_user_id),
  });

  const formattedAmount = state.amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  const formattedShare = sharePerPerson.toLocaleString("es-AR", { minimumFractionDigits: 0 });

  return {
    text: [
      `✅ <b>${state.description}</b> — $${formattedAmount}`,
      ``,
      `💸 Pagó: <b>${payer?.username || payer?.name || "Alguien"}</b>`,
      `👥 Dividido entre ${memberCount}: <b>$${formattedShare} c/u</b>`,
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

  await db.insert(split_payments).values({
    id: randomUUID(),
    session_id: session.id,
    payer_user_id: hermesUser.id,
    payer_temp_id: null,
    payee_user_id: state.creditor_user_id,
    payee_temp_id: null,
    amount: state.debt_amount,
    method: "manual",
    receipt_image_url: null,
    ocr_raw_text: null,
    confirmed_at: Date.now(),
    telegram_update_id: null,
  });

  await clearConversationState(chatId, telegramUserId);

  const creditor = await db.query.users.findFirst({
    where: eq(users.id, state.creditor_user_id),
  });

  const formattedAmount = state.debt_amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });

  return {
    text: [
      `✅ Pago registrado`,
      ``,
      `💰 <b>$${formattedAmount}</b> a <b>${creditor?.username || creditor?.name || "Alguien"}</b>`,
      ``,
      `Usá /balances para ver el estado actualizado.`,
    ].join("\n"),
    edit: true,
  };
}
