import {
  createTelegramDeliveryKey,
  createTelegramOperationContext,
  createTelegramOperationIdentity,
} from "../operation-context";

const contextInput = {
  botId: "bot-a",
  updateId: "42",
  chatId: "chat-1",
  callbackMessageId: 7,
  action: "expense.confirm",
  suffix: "proposal-1",
};

describe("Telegram operation context", () => {
  it("derives deterministic opaque operation and delivery identifiers", () => {
    const first = createTelegramOperationIdentity(createTelegramOperationContext(contextInput));
    const second = createTelegramOperationIdentity(createTelegramOperationContext({ ...contextInput }));

    expect(first).toEqual(second);
    expect(first.operationId).toMatch(/^tgop_v1_[a-f0-9]{64}$/);
    expect(first.deliveryKey).toMatch(/^tgdel_v1_[a-f0-9]{64}$/);
    expect(first.operationId).not.toContain("bot-a");
    expect(first.operationId).not.toContain("proposal-1");
  });

  it("keeps bot, action, and entity namespaces separate", () => {
    const base = createTelegramOperationContext(contextInput);
    const botVariant = createTelegramOperationContext({ ...contextInput, botId: "bot-b" });
    const actionVariant = createTelegramOperationContext({ ...contextInput, action: "expense.cancel" });
    const entityVariant = createTelegramOperationContext({ ...contextInput, suffix: "proposal-2" });

    const ids = [base, botVariant, actionVariant, entityVariant]
      .map(createTelegramOperationIdentity)
      .map((identity) => identity.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("derives distinct delivery keys for distinct logical deliveries", () => {
    const identity = createTelegramOperationIdentity(createTelegramOperationContext(contextInput));

    expect(createTelegramDeliveryKey(identity, "response", "chat-1"))
      .not.toBe(createTelegramDeliveryKey(identity, "reimbursement", "chat-1"));
    expect(createTelegramDeliveryKey(identity, "response", "chat-1"))
      .not.toBe(createTelegramDeliveryKey(identity, "response", "chat-2"));
  });

  it.each([
    ["botId", { botId: "" }],
    ["updateId", { updateId: "\n" }],
    ["chatId", { chatId: "x".repeat(65) }],
    ["action", { action: "x".repeat(97) }],
    ["suffix", { suffix: "x".repeat(129) }],
  ])("rejects invalid %s input", (_name, override) => {
    expect(() => createTelegramOperationContext({ ...contextInput, ...override })).toThrow(/Invalid Telegram operation/);
  });

  it("rejects unsafe callback message IDs", () => {
    expect(() => createTelegramOperationContext({ ...contextInput, callbackMessageId: -1 })).toThrow(
      "Invalid Telegram operation callbackMessageId",
    );
    expect(() => createTelegramOperationContext({ ...contextInput, callbackMessageId: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      "Invalid Telegram operation callbackMessageId",
    );
  });
});
