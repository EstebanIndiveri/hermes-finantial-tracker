import { parseReceiptText } from "../parse-receipt";

describe("parseReceiptText runtime isolation", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it.each(["stub", "not-a-mode"])("returns no transaction candidate when AI_MODE=%s", async (mode) => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.AI_MODE = mode;

    const result = await parseReceiptText("TOTAL $22.215,50");

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps the legacy regex fallback when AI_MODE is absent and no key is configured", async () => {
    delete process.env.AI_MODE;
    delete process.env.GROQ_API_KEY;

    await expect(parseReceiptText("TOTAL $22.215,50")).resolves.toEqual({
      amount_ars: 22215.5,
      category_slug: null,
      merchant: null,
      date_text: null,
      confidence: 0.3,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
