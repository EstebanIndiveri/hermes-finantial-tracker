import type { TelegramDeliveryRow } from "../outbox";
import {
  claimTelegramDelivery,
  purgeExpiredTelegramDeliveries,
} from "../outbox";
import {
  dispatchClaimedTelegramDelivery,
  type TelegramDispatchSummary,
} from "../outbox-dispatcher";
import { runTelegramOutboxWorker } from "../outbox-worker";

jest.mock("../outbox", () => ({
  claimTelegramDelivery: jest.fn(),
  purgeExpiredTelegramDeliveries: jest.fn(),
}));
jest.mock("../outbox-dispatcher", () => ({
  dispatchClaimedTelegramDelivery: jest.fn(),
}));

const claimMock = claimTelegramDelivery as jest.MockedFunction<typeof claimTelegramDelivery>;
const purgeMock = purgeExpiredTelegramDeliveries as jest.MockedFunction<typeof purgeExpiredTelegramDeliveries>;
const dispatchMock = dispatchClaimedTelegramDelivery as jest.MockedFunction<typeof dispatchClaimedTelegramDelivery>;

function row(id: string): TelegramDeliveryRow {
  return {
    id,
    bot_id: "bot-1",
    update_id: `update-${id}`,
    operation_id: `operation-${id}`,
    delivery_key: `delivery-${id}`,
    action: "send_message",
    chat_id: "chat-1",
    message_id: null,
    text: "Confirmado",
    reply_markup_json: null,
    parse_mode: "HTML",
    status: "processing",
    attempt_count: 1,
    next_attempt_at: 1_000,
    lease_token: `lease-${id}`,
    lease_expires_at: 61_000,
    provider_message_id: null,
    last_error_code: null,
    last_http_status: null,
    created_at: 1_000,
    updated_at: 1_000,
    sent_at: null,
    retention_until: 2_000,
  };
}

const sent: TelegramDispatchSummary = { sent: 1, retryable: 0, dead: 0 };

beforeEach(() => {
  jest.resetAllMocks();
  purgeMock.mockResolvedValue(2);
  dispatchMock.mockResolvedValue(sent);
});

it("claims globally for the configured bot, serially, and clamps claims to five", async () => {
  claimMock
    .mockResolvedValueOnce(row("1"))
    .mockResolvedValueOnce(row("2"))
    .mockResolvedValueOnce(row("3"))
    .mockResolvedValueOnce(row("4"))
    .mockResolvedValueOnce(row("5"))
    .mockResolvedValueOnce(null);

  await expect(runTelegramOutboxWorker({
    botId: "bot-1",
    token: "test-token",
    maxClaims: 50,
    now: () => 1_000,
  })).resolves.toEqual({ claimed: 5, sent: 5, retryable: 0, dead: 0, purged: 2 });

  expect(claimMock).toHaveBeenCalledTimes(5);
  expect(claimMock).toHaveBeenNthCalledWith(1, {
    botId: "bot-1",
    now: 1_000,
    leaseMs: 60_000,
  });
  expect(dispatchMock).toHaveBeenCalledTimes(5);
  expect(purgeMock).toHaveBeenCalledWith({ botId: "bot-1", now: 1_000, limit: 100 });
});

it("does not claim when the Telegram token is unavailable", async () => {
  await expect(runTelegramOutboxWorker({
    botId: "bot-1",
    token: "   ",
  })).rejects.toThrow("token is unavailable");

  expect(claimMock).not.toHaveBeenCalled();
  expect(purgeMock).not.toHaveBeenCalled();
});

it("keeps the worker summary limited to counters", async () => {
  claimMock.mockResolvedValueOnce(row("one"));
  dispatchMock.mockResolvedValueOnce({ sent: 0, retryable: 1, dead: 0 });

  const summary = await runTelegramOutboxWorker({
    botId: "bot-1",
    token: "test-token",
    maxClaims: 1,
    purgeLimit: 1,
  });

  expect(Object.keys(summary).sort()).toEqual([
    "claimed",
    "dead",
    "purged",
    "retryable",
    "sent",
  ]);
});

it("shrinks provider timeout to the remaining budget and skips late purge work", async () => {
  claimMock.mockResolvedValueOnce(row("budget"));
  const monotonicTimes = [0, 0, 1_200, 1_200];

  await expect(runTelegramOutboxWorker({
    botId: "bot-1",
    token: "test-token",
    maxClaims: 1,
    budgetMs: 1_000,
    monotonicNow: () => monotonicTimes.shift() ?? 1_200,
  })).resolves.toEqual({ claimed: 1, sent: 1, retryable: 0, dead: 0, purged: 0 });

  expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 1 }));
  expect(purgeMock).not.toHaveBeenCalled();
});
