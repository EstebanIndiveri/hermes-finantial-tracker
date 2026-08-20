import { downloadTelegramFile, transcribeVoiceMessage } from "../voice";

jest.mock("@/lib/ai/groq", () => ({
  transcribeAudio: jest.fn(),
}));

const { transcribeAudio } = require("@/lib/ai/groq");

describe("Voice message handling", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("downloadTelegramFile", () => {
    it("downloads file from Telegram API", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { file_path: "voice/file_123.ogg" },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(100),
        });

      const result = await downloadTelegramFile("file-id-123");

      expect(result).toBeInstanceOf(Buffer);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        "https://api.telegram.org/bottest-bot-token/getFile?file_id=file-id-123"
      );
    });

    it("returns null when getFile fails", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false }),
      });

      const result = await downloadTelegramFile("invalid-file");
      expect(result).toBeNull();
    });

    it("returns null when TELEGRAM_BOT_TOKEN is not set", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      const result = await downloadTelegramFile("file-id-123");
      expect(result).toBeNull();
    });
  });

  describe("transcribeVoiceMessage", () => {
    it("downloads and transcribes voice message", async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            result: { file_path: "voice/file_123.ogg" },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(100),
        });

      transcribeAudio.mockResolvedValue("gasté cinco mil en super");

      const result = await transcribeVoiceMessage("file-id-123");

      expect(result).toBe("gasté cinco mil en super");
      expect(transcribeAudio).toHaveBeenCalled();
    });

    it("returns null when download fails", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false }),
      });

      const result = await transcribeVoiceMessage("invalid-file");
      expect(result).toBeNull();
    });
  });
});
