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
  payer_temp_id?: string; // set when the debtor is a temp_user (not a Hermes user)
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

  if (data.startsWith("ocr_expense:")) {
    return handleOcrExpenseCallback(chatId, telegramUserId, data, state.data);
  }

  if (data.startsWith("ocr_payment:")) {
    return handleOcrPaymentCallback(chatId, telegramUserId, data);
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
  const tempUser = !hermesUser
    ? await db.query.temp_users.findFirst({ where: eq(temp_users.telegram_user_id, telegramUserId) })
    : null;

  if (!hermesUser && !tempUser) {
    await clearConversationState(chatId, telegramUserId);
    return {
      text: "❌ No se encontró tu cuenta.",
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
    payer_user_id: hermesUser?.id ?? null,
    payer_temp_id: tempUser?.id ?? null,
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

// ---------------------------------------------------------------------------
// OCR callback handlers
// ---------------------------------------------------------------------------

interface OcrExpenseState {
  step: string;
  amount: number;
  description: string;
  session_id: string;
}

export type { OcrExpenseState };

/** Builds the OCR expense confirmation message with inline buttons */
export function buildOcrConfirmation(merchant: string, amount: number): TelegramResponse {
  const formatted = amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  return {
    text: [
      "🧾 <b>Ticket detectado</b>",
      "",
      `🏪 Comercio: <b>${merchant}</b>`,
      `💰 Total: <b>$${formatted}</b>`,
      "",
      "¿Registramos este gasto compartido?",
    ].join("\n"),
    replyMarkup: buildInlineKeyboard([
      [{ text: "✅ Sí, registrar gasto", callback_data: "ocr_expense:confirm" }],
      [{ text: "✏️ Cambiar monto/descripción", callback_data: "ocr_expense:edit" }],
      [{ text: "❌ No", callback_data: "ocr_expense:cancel" }],
    ]),
  };
}

/** Parses an Argentine-formatted number from user input (e.g., "2.500", "2500", "2,500.50") */
function parseArgentineNumber(input: string): number {
  const cleaned = input.replace(/^\$\s*/, "").replace(/\s/g, "");
  if (cleaned.includes(",")) {
    // Comma = decimal separator (Argentine style), dots = thousands separators
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }
  // If matches thousands pattern like 2.500 or 25.000
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    return parseInt(cleaned.replace(/\./g, ""), 10);
  }
  return parseFloat(cleaned);
}

/**
 * Handles the user's text reply when they're editing the amount or description from OCR.
 * Called from handler.ts when conversation state is ocr_expense_edit_amount / ocr_expense_edit_desc.
 */
export async function handleOcrEditInput(
  chatId: string,
  telegramUserId: string,
  text: string,
  step: "ocr_expense_edit_amount" | "ocr_expense_edit_desc",
  stateData: OcrExpenseState
): Promise<TelegramResponse | string> {
  if (step === "ocr_expense_edit_amount") {
    const amount = parseArgentineNumber(text.trim());
    if (isNaN(amount) || amount <= 0) {
      return "❌ Monto inválido. Enviá solo el número, ej: <code>2500</code>";
    }
    const newData = { ...stateData, amount, step: "ocr_expense_confirm" };
    await setConversationState(chatId, telegramUserId, { step: "ocr_expense_confirm", data: newData });
    return buildOcrConfirmation(newData.description, amount);
  }

  // edit_desc
  const description = text.trim().slice(0, 100);
  if (!description) {
    return "❌ Descripción vacía. Enviá el nombre del comercio.";
  }
  const newData = { ...stateData, description, step: "ocr_expense_confirm" };
  await setConversationState(chatId, telegramUserId, { step: "ocr_expense_confirm", data: newData });
  return buildOcrConfirmation(description, newData.amount);
}

async function handleOcrExpenseCallback(
  chatId: string,
  telegramUserId: string,
  data: string,
  stateData: unknown
): Promise<TelegramResponse> {
  const action = data.replace("ocr_expense:", "");

  if (action === "cancel") {
    await clearConversationState(chatId, telegramUserId);
    return { text: "❌ Cancelado.", edit: true };
  }

  if (action === "edit") {
    const state = stateData as OcrExpenseState;
    const formatted = (state?.amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 0 });
    return {
      text: [
        "✏️ <b>¿Qué querés editar?</b>",
        "",
        `🏪 Descripción actual: ${state?.description || "Sin descripción"}`,
        `💰 Monto actual: $${formatted}`,
      ].join("\n"),
      edit: true,
      replyMarkup: buildInlineKeyboard([
        [{ text: "💰 Editar monto", callback_data: "ocr_expense:edit_amount" }],
        [{ text: "🏪 Editar descripción", callback_data: "ocr_expense:edit_desc" }],
        [{ text: "↩️ Volver", callback_data: "ocr_expense:back" }],
      ]),
    };
  }

  if (action === "back") {
    const state = stateData as OcrExpenseState;
    return { ...buildOcrConfirmation(state?.description || "Gasto compartido", state?.amount || 0), edit: true };
  }

  if (action === "edit_amount") {
    const state = stateData as OcrExpenseState;
    await setConversationState(chatId, telegramUserId, { step: "ocr_expense_edit_amount", data: state });
    return { text: "✏️ Enviá el nuevo monto (ej: <code>2500</code>):", edit: true };
  }

  if (action === "edit_desc") {
    const state = stateData as OcrExpenseState;
    await setConversationState(chatId, telegramUserId, { step: "ocr_expense_edit_desc", data: state });
    return { text: "✏️ Enviá la nueva descripción (ej: <code>Sushi</code>):", edit: true };
  }

  if (action !== "confirm") {
    return { text: "❌ Acción no reconocida.", edit: true };
  }

  const state = stateData as OcrExpenseState;
  if (!state?.amount || !state?.session_id) {
    await clearConversationState(chatId, telegramUserId);
    return { text: "❌ Datos del ticket no disponibles. Usá /compartido manualmente.", edit: true };
  }

  const session = await db.query.split_sessions.findFirst({
    where: eq(split_sessions.id, state.session_id),
  });
  if (!session) {
    await clearConversationState(chatId, telegramUserId);
    return { text: "❌ Sesión no encontrada.", edit: true };
  }

  const hermesUser = await db.query.users.findFirst({
    where: eq(users.telegram_user_id, telegramUserId),
  });
  if (!hermesUser) {
    await clearConversationState(chatId, telegramUserId);
    return { text: "❌ No tenés cuenta en Hermes.", edit: true };
  }

  await db.insert(split_session_members).values({
    session_id: session.id,
    user_id: hermesUser.id,
    temp_user_id: null,
    joined_at: Date.now(),
  }).onConflictDoNothing();

  const membersRows = await db.query.split_session_members.findMany({
    where: eq(split_session_members.session_id, session.id),
    with: { user: true, tempUser: true },
  });

  const seenUserIds = new Set<string>();
  const seenTempIds = new Set<string>();
  const uniqueMembers = membersRows.filter(m => {
    if (m.user_id) {
      if (seenUserIds.has(m.user_id)) return false;
      seenUserIds.add(m.user_id);
      return true;
    }
    if (m.temp_user_id) {
      if (seenTempIds.has(m.temp_user_id)) return false;
      seenTempIds.add(m.temp_user_id);
      return true;
    }
    return false;
  });

  const buttons = uniqueMembers.flatMap(m => {
    if (m.user && m.user_id) {
      const label = m.user_id === hermesUser.id
        ? `${m.user.username || m.user.name} (vos)`
        : (m.user.username || m.user.name);
      return [[{ text: label, callback_data: `paid_by:user:${m.user_id}` }]];
    }
    if (m.tempUser && m.temp_user_id) {
      const name = m.tempUser.telegram_username
        ? (m.tempUser.telegram_username.startsWith("@") ? m.tempUser.telegram_username : `@${m.tempUser.telegram_username}`)
        : m.tempUser.first_name;
      return [[{ text: name, callback_data: `paid_by:temp:${m.temp_user_id}` }]];
    }
    return [];
  });
  buttons.push([{ text: "💳 Pagaron varios", callback_data: "paid_by:varios" }]);

  const newState: CompartidoState = {
    step: "who_paid",
    amount: state.amount,
    description: state.description,
    session_id: state.session_id,
  };
  await setConversationState(chatId, telegramUserId, { step: "who_paid", data: newState });

  const formattedAmount = state.amount.toLocaleString("es-AR", { minimumFractionDigits: 0 });
  return {
    text: [`💳 ¿Quién pagó?`, `${state.description} — $${formattedAmount}`].join("\n"),
    replyMarkup: buildInlineKeyboard(buttons),
    edit: true,
  };
}

async function handleOcrPaymentCallback(
  chatId: string,
  telegramUserId: string,
  data: string,
): Promise<TelegramResponse> {
  const action = data.replace("ocr_payment:", "");

  if (action === "cancel") {
    await clearConversationState(chatId, telegramUserId);
    return { text: "❌ Cancelado.", edit: true };
  }

  if (action !== "confirm") {
    return { text: "❌ Acción no reconocida.", edit: true };
  }

  await clearConversationState(chatId, telegramUserId);

  // Delegate to the standard /pague flow
  const { handlePague } = await import("./commands/pague");
  const response = await handlePague(chatId, telegramUserId);
  return { ...response, edit: false };
}
