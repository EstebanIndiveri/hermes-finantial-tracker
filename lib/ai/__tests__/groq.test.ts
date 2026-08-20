import { transcribeAudio } from "../groq";

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

  it("returns null when GROQ_API_KEY is not set", async () => {
    delete process.env.GROQ_API_KEY;
    const result = await transcribeAudio(Buffer.from("audio"));
    expect(result).toBeNull();
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

  it("returns null on API error", async () => {
    process.env.GROQ_API_KEY = "test-key";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await transcribeAudio(Buffer.from("fake-audio"));
    expect(result).toBeNull();
  });
});
