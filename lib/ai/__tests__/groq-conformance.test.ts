import { getGroqClient, GroqCompletionError } from "../groq";
import { parseFinancialMessage } from "../parse-message";
import { parseReceiptText } from "../parse-receipt";

describe("offline Groq completion conformance", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, AI_MODE: "live", GROQ_API_KEY: "synthetic-test-key" };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("classifies an empty length completion at the 300-token limit using safe metadata only", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "synthetic/model-v1",
        choices: [{ message: { content: "" }, finish_reason: "length" }],
        usage: { prompt_tokens: 28, completion_tokens: 300 },
      }),
    });

    await expect(getGroqClient()!.complete("synthetic system", "synthetic expense message"))
      .rejects.toMatchObject({
        code: "GROQ_EMPTY_COMPLETION",
        metadata: {
          model: "synthetic/model-v1",
          finishReason: "length",
          promptTokens: 28,
          completionTokens: 300,
        },
      });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("classifies an empty stop completion without inventing output", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "synthetic/model-v1",
        choices: [{ message: { content: "  " }, finish_reason: "stop" }],
        usage: { prompt_tokens: 17, completion_tokens: 0 },
      }),
    });

    await expect(getGroqClient()!.complete("synthetic system", "synthetic query"))
      .rejects.toMatchObject({
        code: "GROQ_EMPTY_COMPLETION",
        metadata: {
          finishReason: "stop",
          promptTokens: 17,
          completionTokens: 0,
        },
      });
  });

  it("passes a valid synthetic JSON completion through unchanged", async () => {
    const completion = JSON.stringify({ intent: "query_summary", confidence: 0.9 });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "synthetic/model-v1",
        choices: [{ message: { content: completion }, finish_reason: "stop" }],
        usage: { prompt_tokens: 20, completion_tokens: 12 },
      }),
    });

    await expect(getGroqClient()!.complete("synthetic system", "synthetic query"))
      .resolves.toBe(completion);
  });

  it("drops malformed provider metadata and does not expose it in parser logs", async () => {
    const sensitiveMarker = "SYNTHETIC_PRIVATE_MARKER";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: `model\n${sensitiveMarker}`,
        choices: [{ message: { content: null }, finish_reason: { detail: sensitiveMarker } }],
        usage: { prompt_tokens: -1, completion_tokens: 2.5 },
      }),
    });
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await parseFinancialMessage(`synthetic message ${sensitiveMarker}`);

    expect(result).toMatchObject({ intent: "unknown", confidence: 0 });
    expect(errorLog).toHaveBeenCalledWith("Groq API error:", "GROQ_EMPTY_COMPLETION", {});
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(sensitiveMarker);
  });

  it("returns only allowlisted metadata from a typed empty completion error", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "safe-model:1",
        choices: [{ message: { content: "" }, finish_reason: "length" }],
        usage: { prompt_tokens: 4, completion_tokens: 300 },
      }),
    });

    let caught: unknown;
    try {
      await getGroqClient()!.complete("synthetic prompt", "synthetic input");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(GroqCompletionError);
    expect((caught as GroqCompletionError).metadata).toEqual({
      model: "safe-model:1",
      finishReason: "length",
      promptTokens: 4,
      completionTokens: 300,
    });
  });

  it("uses the reconciled explicit total when the synthetic receipt completion is empty", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "synthetic/model-v1",
        choices: [{ message: { content: "" }, finish_reason: "length" }],
        usage: { prompt_tokens: 30, completion_tokens: 300 },
      }),
    });
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(parseReceiptText(
      "Subtotal 28154,71 Descuento -601,98 -2003,96 TOIAL 25548,77",
    )).resolves.toMatchObject({ amount_ars: 25548.77, confidence: 0.9 });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("Subtotal");
  });

  it("abstains on an ambiguous synthetic receipt total after an empty completion", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "" }, finish_reason: "stop" }],
      }),
    });
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(parseReceiptText(
      "TOTAL 1539,62 28154,71 25548,77 SYNTHETIC_PRIVATE_MARKER",
    )).resolves.toBeNull();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("SYNTHETIC_PRIVATE_MARKER");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
