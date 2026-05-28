import { sendTelegramMessage } from "../send-message";

describe("sendTelegramMessage", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("should throw when TELEGRAM_BOT_TOKEN not set", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    await expect(sendTelegramMessage("123456", "test message")).rejects.toThrow(
      "TELEGRAM_BOT_TOKEN not set"
    );
  });

  it("should throw when API returns non-ok response", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () => "API error details",
    }) as jest.Mock;

    await expect(sendTelegramMessage("123456", "test message")).rejects.toThrow(
      "Telegram API error: API error details"
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: "123456",
          text: "test message",
          parse_mode: "HTML",
        }),
      })
    );
  });

  it("should resolve on success", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: {} }),
    }) as jest.Mock;

    await expect(sendTelegramMessage("123456", "test message")).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          chat_id: "123456",
          text: "test message",
          parse_mode: "HTML",
        }),
      })
    );
  });
});
