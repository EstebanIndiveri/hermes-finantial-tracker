import { createHash } from "node:crypto";

const OPERATION_VERSION = "tgop_v1";
const DELIVERY_VERSION = "tgdel_v1";

export const TELEGRAM_OPERATION_LIMITS = {
  botId: 64,
  updateId: 64,
  chatId: 64,
  action: 96,
  suffix: 128,
  deliveryAction: 96,
  deliveryTarget: 128,
} as const;

export interface TelegramOperationContextInput {
  botId: string;
  updateId: string;
  chatId: string;
  callbackMessageId?: number | null;
  action: string;
  suffix?: string | null;
}

export interface TelegramOperationContext {
  readonly botId: string;
  readonly updateId: string;
  readonly chatId: string;
  readonly callbackMessageId?: number;
  readonly action: string;
  readonly suffix?: string;
}

export interface TelegramOperationIdentity {
  readonly operationId: string;
  readonly deliveryKey: string;
}

function validateText(name: string, value: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(`Invalid Telegram operation ${name}`);
  }
  if (value.includes("\u0000") || /[\r\n]/.test(value)) {
    throw new Error(`Invalid Telegram operation ${name}`);
  }
  return value;
}

function canonicalIdentityParts(context: Pick<TelegramOperationContext, "botId" | "updateId" | "action" | "suffix">): string {
  return JSON.stringify([
    context.botId,
    context.updateId,
    context.action,
    context.suffix ?? "",
  ]);
}

function digest(version: string, value: string): string {
  return createHash("sha256").update(`${version}\u0000${value}`, "utf8").digest("hex");
}

export function createTelegramOperationContext(input: TelegramOperationContextInput): TelegramOperationContext {
  const botId = validateText("botId", input.botId, TELEGRAM_OPERATION_LIMITS.botId);
  const updateId = validateText("updateId", input.updateId, TELEGRAM_OPERATION_LIMITS.updateId);
  const chatId = validateText("chatId", input.chatId, TELEGRAM_OPERATION_LIMITS.chatId);
  const action = validateText("action", input.action, TELEGRAM_OPERATION_LIMITS.action);
  const suffix = input.suffix == null
    ? undefined
    : validateText("suffix", input.suffix, TELEGRAM_OPERATION_LIMITS.suffix);

  if (input.callbackMessageId != null &&
      (!Number.isSafeInteger(input.callbackMessageId) || input.callbackMessageId < 0)) {
    throw new Error("Invalid Telegram operation callbackMessageId");
  }

  return Object.freeze({
    botId,
    updateId,
    chatId,
    ...(input.callbackMessageId == null ? {} : { callbackMessageId: input.callbackMessageId }),
    action,
    ...(suffix === undefined ? {} : { suffix }),
  });
}

export function createTelegramOperationIdentity(context: TelegramOperationContext): TelegramOperationIdentity {
  const operationId = `${OPERATION_VERSION}_${digest(OPERATION_VERSION, canonicalIdentityParts(context))}`;
  const deliveryKey = createTelegramDeliveryKey({ operationId }, "commit", context.chatId);
  return Object.freeze({ operationId, deliveryKey });
}

export function createTelegramDeliveryKey(
  identity: Pick<TelegramOperationIdentity, "operationId">,
  deliveryAction: string,
  deliveryTarget = "",
): string {
  validateText("operationId", identity.operationId, 80);
  validateText("deliveryAction", deliveryAction, TELEGRAM_OPERATION_LIMITS.deliveryAction);
  if (deliveryTarget.length > 0) {
    validateText("deliveryTarget", deliveryTarget, TELEGRAM_OPERATION_LIMITS.deliveryTarget);
  }
  const payload = JSON.stringify([identity.operationId, deliveryAction, deliveryTarget]);
  return `${DELIVERY_VERSION}_${digest(DELIVERY_VERSION, payload)}`;
}
