import {
  claimTelegramDelivery,
  markTelegramDeliveryDead,
  markTelegramDeliveryRetryable,
  markTelegramDeliverySent,
  type TelegramDeliveryRow,
} from "../outbox";
import { dispatchTelegramDeliveriesForUpdate } from "../outbox-dispatcher";

jest.mock("../outbox", () => ({
  claimTelegramDelivery: jest.fn(),
  markTelegramDeliveryDead: jest.fn(),
  markTelegramDeliveryRetryable: jest.fn(),
  markTelegramDeliverySent: jest.fn(),
}));

const claimMock = claimTelegramDelivery as jest.MockedFunction<typeof claimTelegramDelivery>;
const deadMock = markTelegramDeliveryDead as jest.MockedFunction<typeof markTelegramDeliveryDead>;
const retryMock = markTelegramDeliveryRetryable as jest.MockedFunction<typeof markTelegramDeliveryRetryable>;
const sentMock = markTelegramDeliverySent as jest.MockedFunction<typeof markTelegramDeliverySent>;

function row(overrides: Partial<TelegramDeliveryRow> = {}): TelegramDeliveryRow {
  return {
    id: "delivery-1",
    bot_id: "bot-1",
    update_id: "update-1",
    operation_id: "operation-1",
    delivery_key: "primary",
    action: "send_message",
    chat_id: "chat-1",
    message_id: null,
    text: "Confirmado",
    reply_markup_json: null,
    parse_mode: "HTML",
    status: "processing",
    attempt_count: 1,
    next_attempt_at: 1_000,
    lease_token: "lease-1",
    lease_expires_at: 61_000,
    provider_message_id: null,
    last_error_code: null,
    last_http_status: null,
    created_at: 1_000,
    updated_at: 1_000,
    sent_at: null,
    retention_until: 2_000,
    ...overrides,
  };
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  claimMock.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
  sentMock.mockResolvedValue(true);
  retryMock.mockResolvedValue(true);
  deadMock.mockResolvedValue(true);
});

it("marks a successful provider delivery as sent", async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(200, { ok: true, result: { message_id: 42 } }));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 1_000,
  })).resolves.toEqual({ sent: 1, retryable: 0, dead: 0 });

  expect(sentMock).toHaveBeenCalledWith({
    id: "delivery-1",
    leaseToken: "lease-1",
    providerMessageId: "42",
    now: 1_000,
  });
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://api.telegram.org/bottest-token/sendMessage",
    expect.objectContaining({ method: "POST" }),
  );
});

it("treats an unchanged edit as a successful idempotent delivery", async () => {
  claimMock.mockReset().mockResolvedValueOnce(row({ action: "edit_message", message_id: 99 })).mockResolvedValueOnce(null);
  const fetchImpl = jest.fn().mockResolvedValue(response(400, {
    ok: false,
    description: "Bad Request: message is not modified",
  }));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 2_000,
  })).resolves.toEqual({ sent: 1, retryable: 0, dead: 0 });
  expect(sentMock).toHaveBeenCalledTimes(1);
  expect(retryMock).not.toHaveBeenCalled();
});

it("uses Telegram retry_after for rate limits", async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(429, {
    ok: false,
    parameters: { retry_after: 7 },
  }));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 5_000,
  })).resolves.toEqual({ sent: 0, retryable: 1, dead: 0 });
  expect(retryMock).toHaveBeenCalledWith(expect.objectContaining({
    errorCode: "rate_limited",
    httpStatus: 429,
    retryAt: 12_000,
  }));
});

it("marks permanent provider rejection dead", async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(403, { ok: false, description: "Forbidden" }));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 8_000,
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 1 });
  expect(deadMock).toHaveBeenCalledWith(expect.objectContaining({
    errorCode: "provider_rejected",
    httpStatus: 403,
  }));
});

it("keeps network failures retryable without exposing provider text", async () => {
  const fetchImpl = jest.fn().mockRejectedValue(new Error("secret provider details"));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 9_000,
  })).resolves.toEqual({ sent: 0, retryable: 1, dead: 0 });
  expect(retryMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "network_error" }));
  expect(JSON.stringify(retryMock.mock.calls)).not.toContain("secret provider details");
});

it("marks exhausted transient failures dead", async () => {
  claimMock.mockReset().mockResolvedValueOnce(row({ attempt_count: 8 })).mockResolvedValueOnce(null);
  const fetchImpl = jest.fn().mockResolvedValue(response(503, { ok: false }));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 9_500,
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 1 });
  expect(deadMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "attempts_exhausted" }));
});

it("marks malformed stored markup dead without contacting Telegram", async () => {
  claimMock.mockReset().mockResolvedValueOnce(row({ reply_markup_json: "[]" })).mockResolvedValueOnce(null);
  const fetchImpl = jest.fn();

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 9_750,
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 1 });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(deadMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "invalid_payload" }));
});

it("keeps delivery retryable when no bot token is configured", async () => {
  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "",
    fetchImpl: jest.fn(),
    now: () => 10_000,
  })).resolves.toEqual({ sent: 0, retryable: 1, dead: 0 });
  expect(retryMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "missing_token" }));
});
