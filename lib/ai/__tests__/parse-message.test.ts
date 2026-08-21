import { parseFinancialMessage } from "../parse-message";

describe("parseFinancialMessage", () => {
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

  it("should return unknown intent with confidence 0 when no GROQ_API_KEY", async () => {
    delete process.env.GROQ_API_KEY;

    const result = await parseFinancialMessage("gasté 5000 en supermercado");

    expect(result).toEqual({
      intent: "unknown",
      confidence: 0,
      needs_confirmation: false,
      requires_reimbursement: false,
    });
  });

  it("should return unknown intent with confidence 0 when Groq returns invalid JSON", async () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_MODEL = "llama3-8b-8192";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "invalid json here" } }],
      }),
    }) as jest.Mock;

    const result = await parseFinancialMessage("gasté 5000 en supermercado");

    expect(result).toEqual({
      intent: "unknown",
      confidence: 0,
      needs_confirmation: false,
      requires_reimbursement: false,
    });
  });

  it("should return parsed result when Groq returns valid JSON matching schema", async () => {
    process.env.GROQ_API_KEY = "test-key";

    const validResponse = {
      intent: "register_expense",
      amount_ars: 5000,
      category: "supermercado",
      merchant: "Carrefour",
      description: null,
      date_text: null,
      needs_confirmation: false,
      confidence: 0.95,
      requires_reimbursement: false,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(validResponse) } }],
      }),
    }) as jest.Mock;

    const result = await parseFinancialMessage("gasté 5000 en supermercado Carrefour");

    expect(result).toEqual(validResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
      })
    );
  });

  it("should use default model when GROQ_MODEL not set", async () => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.GROQ_MODEL;

    const validResponse = {
      intent: "query_summary",
      amount_ars: null,
      category: null,
      merchant: null,
      description: null,
      date_text: null,
      needs_confirmation: false,
      confidence: 0.9,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(validResponse) } }],
      }),
    }) as jest.Mock;

    await parseFinancialMessage("cómo va el mes?");

    const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.model).toBe("llama-3.3-70b-versatile");
  });
});
