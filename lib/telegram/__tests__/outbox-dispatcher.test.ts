import {
  claimTelegramDelivery,
  markTelegramDeliveryDead,
  markTelegramDeliveryRetryable,
  markTelegramDeliverySent,
  type TelegramDeliveryRow,
} from "../outbox";
import { dispatchTelegramDeliveriesForUpdate } from "../outbox-dispatcher";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({ db: { select: jest.fn() } }));

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
  })).resolves.toEqual({ sent: 1, retryable: 0, dead: 0, lostLease: 0 });

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

it("reports a lost lease instead of a durable send after Telegram accepts the message", async () => {
  sentMock.mockResolvedValue(false);
  const fetchImpl = jest.fn().mockResolvedValue(response(200, { ok: true, result: { message_id: 42 } }));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 1_000,
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 0, lostLease: 1 });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(retryMock).not.toHaveBeenCalled();
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
  })).resolves.toEqual({ sent: 1, retryable: 0, dead: 0, lostLease: 0 });
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
  })).resolves.toEqual({ sent: 0, retryable: 1, dead: 0, lostLease: 0 });
  expect(retryMock).toHaveBeenCalledWith(expect.objectContaining({
    errorCode: "rate_limited",
    httpStatus: 429,
    retryAt: 12_000,
  }));
});

it("does not count a retry when the lease has been taken by another worker", async () => {
  retryMock.mockResolvedValue(false);
  const fetchImpl = jest.fn().mockResolvedValue(response(429, { ok: false }));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1", updateId: "update-1", token: "test-token", fetchImpl, now: () => 5_000,
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 0, lostLease: 1 });
});

it("marks permanent provider rejection dead", async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(403, { ok: false, description: "Forbidden" }));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 8_000,
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 1, lostLease: 0 });
  expect(deadMock).toHaveBeenCalledWith(expect.objectContaining({
    errorCode: "provider_rejected",
    httpStatus: 403,
  }));
});

it("does not count a dead delivery when the lease has been taken by another worker", async () => {
  deadMock.mockResolvedValue(false);
  const fetchImpl = jest.fn().mockResolvedValue(response(403, { ok: false }));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1", updateId: "update-1", token: "test-token", fetchImpl, now: () => 8_000,
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 0, lostLease: 1 });
});

it("keeps network failures retryable without exposing provider text", async () => {
  const fetchImpl = jest.fn().mockRejectedValue(new Error("secret provider details"));

  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1",
    updateId: "update-1",
    token: "test-token",
    fetchImpl,
    now: () => 9_000,
  })).resolves.toEqual({ sent: 0, retryable: 1, dead: 0, lostLease: 0 });
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
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 1, lostLease: 0 });
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
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 1, lostLease: 0 });
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
  })).resolves.toEqual({ sent: 0, retryable: 1, dead: 0, lostLease: 0 });
  expect(retryMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "missing_token" }));
});

it("reports a lost lease when a tokenless delivery cannot be marked retryable", async () => {
  retryMock.mockResolvedValue(false);
  await expect(dispatchTelegramDeliveriesForUpdate({
    botId: "bot-1", updateId: "update-1", token: "", fetchImpl: jest.fn(), now: () => 10_000,
  })).resolves.toEqual({ sent: 0, retryable: 0, dead: 0, lostLease: 1 });
});

function webReimbursementRows(options: { requesterChat?: string; paid?: boolean; members?: string[] } = {}) {
  const values = [
    [{ botId: "bot-1", updateId: "web-reimbursement-pay:request-1", kind: "web.reimbursement.pay", status: "committed", resourceType: "reimbursement", reimbursementId: "request-1", context: JSON.stringify({ payerId: "payer-1", requesterId: "requester-1", groupId: "group-1" }) }],
    [{ transactionId: "expense-1", requesterId: "requester-1", payerId: "payer-1", status: options.paid === false ? "pending" : "paid" }],
    [{ groupId: "group-1", status: "active", deletedAt: null }],
    (options.members ?? ["payer-1", "requester-1"]).map((userId) => ({ userId })),
    [{ telegramId: options.requesterChat ?? "requester-chat" }],
  ];
  let selection = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const result = () => Promise.resolve(values[selection++] ?? []);
    const query = { where: jest.fn(() => query), limit: jest.fn(result), then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => result().then(resolve, reject) };
    return { from: jest.fn(() => query) };
  });
}

it("sends a web reimbursement payment only while its paid state and recipient are valid", async () => {
  claimMock.mockReset().mockResolvedValueOnce(row({ update_id: "web-reimbursement-pay:request-1", chat_id: "requester-chat" })).mockResolvedValueOnce(null);
  webReimbursementRows();
  const fetchImpl = jest.fn().mockResolvedValue(response(200, { ok: true, result: { message_id: 77 } }));
  await expect(dispatchTelegramDeliveriesForUpdate({ botId: "bot-1", updateId: "web-reimbursement-pay:request-1", token: "test-token", fetchImpl })).resolves.toMatchObject({ sent: 1 });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([
  ["unpaid", { paid: false }, "payment_changed"],
  ["removed requester", { members: ["payer-1"] }, "membership_revoked"],
  ["changed chat", { requesterChat: "different-chat" }, "recipient_changed"],
] as const)("rejects a web reimbursement payment with %s", async (_label, options, code) => {
  claimMock.mockReset().mockResolvedValueOnce(row({ update_id: "web-reimbursement-pay:request-1", chat_id: "requester-chat" })).mockResolvedValueOnce(null);
  webReimbursementRows(options);
  const fetchImpl = jest.fn();
  await expect(dispatchTelegramDeliveriesForUpdate({ botId: "bot-1", updateId: "web-reimbursement-pay:request-1", token: "test-token", fetchImpl })).resolves.toMatchObject({ dead: 1 });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(deadMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: code }));
});

it("never resends an uncertain web reimbursement payment", async () => {
  claimMock.mockReset().mockResolvedValueOnce(row({ update_id: "web-reimbursement-pay:request-1", chat_id: "requester-chat", attempt_count: 2 })).mockResolvedValueOnce(null);
  const fetchImpl = jest.fn();
  await expect(dispatchTelegramDeliveriesForUpdate({ botId: "bot-1", updateId: "web-reimbursement-pay:request-1", token: "test-token", fetchImpl })).resolves.toMatchObject({ dead: 1 });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(deadMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "delivery_uncertain" }));
});

function webReimbursementRequestRows(options: { status?: string; requesterMember?: boolean; recipientMember?: boolean; recipientChat?: string; amountArs?: number; groupId?: string; legacy?: boolean } = {}) {
  const values = [
    [{ botId: "bot-1", updateId: "web-reimbursement:request-1", kind: "web.reimbursement.create", status: "committed", resourceType: "reimbursement", reimbursementId: "request-1", context: JSON.stringify({ request: { requesterId: "requester-1", payerId: "payer-1", amount: 2500 }, ...(options.legacy ? {} : { groupId: "group-1", recipients: [{ userId: "recipient-1", chatId: "recipient-chat" }] }) }) }],
    [{ transactionId: "expense-1", requesterId: "requester-1", payerId: "payer-1", amount: 2500, status: options.status ?? "pending" }],
    [{ userId: "requester-1", groupId: options.groupId ?? "group-1", amountArs: options.amountArs ?? 2500, status: "active", deletedAt: null }],
    options.requesterMember === false ? [] : [{ userId: "requester-1" }],
    [{ id: "recipient-1", telegramId: options.recipientChat ?? "recipient-chat" }],
    options.recipientMember === false ? [] : [{ userId: "recipient-1" }],
    [{ userId: "payer-1" }],
  ];
  let selection = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const result = () => Promise.resolve(values[selection++] ?? []);
    const query = { where: jest.fn(() => query), limit: jest.fn(result), then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => result().then(resolve, reject) };
    return { from: jest.fn(() => query) };
  });
}

it("delivers a web reimbursement request only to a current group member", async () => {
  claimMock.mockReset().mockResolvedValueOnce(row({ update_id: "web-reimbursement:request-1", chat_id: "recipient-chat" })).mockResolvedValueOnce(null);
  webReimbursementRequestRows();
  const fetchImpl = jest.fn().mockResolvedValue(response(200, { ok: true, result: { message_id: 88 } }));
  await expect(dispatchTelegramDeliveriesForUpdate({ botId: "bot-1", updateId: "web-reimbursement:request-1", token: "test-token", fetchImpl })).resolves.toMatchObject({ sent: 1 });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("revalidates older committed web requests without recipient metadata against current group membership", async () => {
  claimMock.mockReset().mockResolvedValueOnce(row({ update_id: "web-reimbursement:request-1", chat_id: "recipient-chat" })).mockResolvedValueOnce(null);
  webReimbursementRequestRows({ legacy: true });
  const fetchImpl = jest.fn().mockResolvedValue(response(200, { ok: true, result: { message_id: 88 } }));
  await expect(dispatchTelegramDeliveriesForUpdate({ botId: "bot-1", updateId: "web-reimbursement:request-1", token: "test-token", fetchImpl })).resolves.toMatchObject({ sent: 1 });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([
  ["paid before dispatch", { status: "paid" }, "request_changed"],
  ["requester removed", { requesterMember: false }, "membership_revoked"],
  ["recipient removed", { recipientMember: false }, "membership_revoked"],
  ["recipient relinked", { recipientChat: "other-chat" }, "recipient_changed"],
  ["expense amount changed", { amountArs: 3000 }, "request_changed"],
  ["expense moved to another group", { groupId: "group-2" }, "request_changed"],
] as const)("rejects a stale web reimbursement request: %s", async (_label, options, code) => {
  claimMock.mockReset().mockResolvedValueOnce(row({ update_id: "web-reimbursement:request-1", chat_id: "recipient-chat" })).mockResolvedValueOnce(null);
  webReimbursementRequestRows(options);
  const fetchImpl = jest.fn();
  await expect(dispatchTelegramDeliveriesForUpdate({ botId: "bot-1", updateId: "web-reimbursement:request-1", token: "test-token", fetchImpl })).resolves.toMatchObject({ dead: 1 });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(deadMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: code }));
});

it("does not resend an uncertain web reimbursement request", async () => {
  claimMock.mockReset().mockResolvedValueOnce(row({ update_id: "web-reimbursement:request-1", chat_id: "recipient-chat", attempt_count: 2 })).mockResolvedValueOnce(null);
  const fetchImpl = jest.fn();
  await expect(dispatchTelegramDeliveriesForUpdate({ botId: "bot-1", updateId: "web-reimbursement:request-1", token: "test-token", fetchImpl })).resolves.toMatchObject({ dead: 1 });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(deadMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "delivery_uncertain" }));
});
