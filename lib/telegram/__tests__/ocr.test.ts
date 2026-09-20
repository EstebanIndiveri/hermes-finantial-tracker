import { ocrTelegramDocument, ocrTelegramPhoto, runOcrOnBuffer } from "../ocr";

describe("OCR runtime isolation", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it.each(["stub", "unsupported"])("does not make provider or Telegram calls when OCR_MODE=%s", async (mode) => {
    process.env.OCR_MODE = mode;
    process.env.OCR_SPACE_API_KEY = "test-key";
    process.env.TELEGRAM_BOT_TOKEN = "token";

    await expect(runOcrOnBuffer(Buffer.from("image"))).resolves.toEqual({ text: "", isReliable: false });
    await expect(ocrTelegramPhoto([{ file_id: "photo", width: 1, height: 1 }])).resolves.toEqual({ text: "", isReliable: false });
    await expect(ocrTelegramDocument({ file_id: "document", mime_type: "image/jpeg" })).resolves.toEqual({ text: "", isReliable: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps legacy live OCR.Space behavior when OCR_MODE is absent", async () => {
    delete process.env.OCR_MODE;
    process.env.OCR_SPACE_API_KEY = "test-key";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        OCRExitCode: 1,
        ParsedResults: [{ ParsedText: "TOTAL $5000" }],
      }),
    });

    await expect(runOcrOnBuffer(Buffer.from("image"))).resolves.toEqual({
      text: "TOTAL $5000",
      isReliable: true,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.ocr.space/parse/image",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
