import { getGroqClient, transcribeAudio, TranscriptionError } from "../groq";

describe("Groq transcribeAudio", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("reports missing Groq credentials with a stable error", async () => {
    delete process.env.GROQ_API_KEY;
    await expect(transcribeAudio(Buffer.from("audio"))).rejects.toMatchObject({
      code: "GROQ_API_KEY_MISSING",
    });
  });

  it.each(["stub", "not-a-mode"])("does not call Groq Whisper when AI_MODE=%s", async (mode) => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.AI_MODE = mode;

    await expect(transcribeAudio(Buffer.from("audio"))).rejects.toMatchObject({
      code: mode === "stub" ? "AI_MODE_STUB" : "AI_MODE_INVALID",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports an empty audio payload before contacting Groq", async () => {
    process.env.GROQ_API_KEY = "test-key";
    await expect(transcribeAudio(Buffer.alloc(0))).rejects.toMatchObject({ code: "AUDIO_EMPTY" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not construct a text client when AI_MODE is stub or invalid", () => {
    process.env.GROQ_API_KEY = "test-key";

    process.env.AI_MODE = "stub";
    expect(getGroqClient()).toBeNull();

    process.env.AI_MODE = "ambiguous";
    expect(getGroqClient()).toBeNull();
  });

  it("transcribes audio successfully", async () => {
    process.env.GROQ_API_KEY = "test-key";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ text: "gasté cinco mil en supermercado" }),
    });

    const result = await transcribeAudio(Buffer.from("fake-audio"));

    expect(result).toBe("gasté cinco mil en supermercado");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
  });

  it("reports provider errors without exposing their response body", async () => {
    process.env.GROQ_API_KEY = "test-key";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(transcribeAudio(Buffer.from("fake-audio"))).rejects.toMatchObject({
      code: "GROQ_HTTP_5XX",
    });
  });

  it("reports empty provider transcriptions", async () => {
    process.env.GROQ_API_KEY = "test-key";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ text: "  " }),
    });

    const result = transcribeAudio(Buffer.from("fake-audio"));
    await expect(result).rejects.toBeInstanceOf(TranscriptionError);
    await expect(result).rejects.toMatchObject({ code: "GROQ_EMPTY_TRANSCRIPTION" });
  });
});
