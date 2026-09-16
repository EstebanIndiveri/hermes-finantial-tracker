import {
  parseAmountToken,
  extractAmountFromMessage,
  detectCategorySlug,
  hasReimbursementIntent,
  detectSimpleQueryIntent,
  parseExpenseFallback,
} from "../expense-fallback";

describe("parseAmountToken", () => {
  it("parses plain integers", () => {
    expect(parseAmountToken("16739")).toBe(16739);
    expect(parseAmountToken("13568")).toBe(13568);
    expect(parseAmountToken("15000")).toBe(15000);
  });

  it("parses Argentine grouped thousands (dot separator)", () => {
    expect(parseAmountToken("16.739")).toBe(16739);
    expect(parseAmountToken("1.234.567")).toBe(1234567);
  });

  it("parses US-style grouped thousands (comma separator from Whisper)", () => {
    expect(parseAmountToken("13,568")).toBe(13568);
    expect(parseAmountToken("1,234,567")).toBe(1234567);
  });

  it("parses decimal amounts", () => {
    expect(parseAmountToken("19,50")).toBeCloseTo(19.5);
    expect(parseAmountToken("19.50")).toBeCloseTo(19.5);
  });

  it("returns null for non-numeric tokens", () => {
    expect(parseAmountToken("supermercado")).toBeNull();
    expect(parseAmountToken("")).toBeNull();
  });
});

describe("extractAmountFromMessage", () => {
  // Cases straight from the failing screenshots
  it("extracts amount when it appears after a verb (regression: Gaste 13568 supermercado)", () => {
    expect(extractAmountFromMessage("Gaste 13568 supermercado")).toBe(13568);
  });

  it("extracts amount from 'Gasto 16739 salidas pareja'", () => {
    expect(extractAmountFromMessage("Gasto 16739 salidas pareja")).toBe(16739);
  });

  it("extracts amount from 'Gasto en salidas pareja 16739' (amount at end)", () => {
    expect(extractAmountFromMessage("Gasto en salidas pareja 16739")).toBe(16739);
  });

  it("extracts amount from voice transcription with dot grouping", () => {
    expect(extractAmountFromMessage("Gasté 16.739 salidas en pareja")).toBe(16739);
  });

  it("extracts amount from voice transcription with US comma and $ sign", () => {
    expect(extractAmountFromMessage("Gasté en el super $13,568 pesos")).toBe(13568);
  });

  it("supports slang: 15k, lucas, palos", () => {
    expect(extractAmountFromMessage("gasté 15k en super")).toBe(15000);
    expect(extractAmountFromMessage("compré 20 lucas verdulería")).toBe(20000);
    expect(extractAmountFromMessage("2 palos de viaje")).toBe(2000000);
  });

  it("supports 'X mil' and word numbers", () => {
    expect(extractAmountFromMessage("gasté 15 mil en super")).toBe(15000);
    expect(extractAmountFromMessage("quince mil restaurante")).toBe(15000);
  });

  it("returns null when there is no amount", () => {
    expect(extractAmountFromMessage("gasto de super")).toBeNull();
    expect(extractAmountFromMessage("disponible")).toBeNull();
  });

  // Regressions found during code review
  it("does not pick a trailing year as the amount", () => {
    expect(extractAmountFromMessage("gaste 500 el 2024")).toBe(500);
  });

  it("prefers the first amount, not the largest", () => {
    expect(extractAmountFromMessage("gaste 13568 en super")).toBe(13568);
  });

  it("reads standalone 'mil' as 1000 even with a leading quantity word", () => {
    expect(extractAmountFromMessage("compre 3 productos por mil pesos")).toBe(1000);
  });
});

describe("detectCategorySlug", () => {
  it("detects category regardless of amount position (regression)", () => {
    expect(detectCategorySlug("Gaste 13568 supermercado")).toBe("supermercado");
    expect(detectCategorySlug("Gasto 16739 salidas pareja")).toBe("salidas_pareja");
    expect(detectCategorySlug("Gasto en salidas pareja 16739")).toBe("salidas_pareja");
  });

  it("never picks a number as the category", () => {
    // "Gaste 13568 supermercado" must NOT match on 13568
    expect(detectCategorySlug("gasté 13568")).toBeNull();
  });

  it("detects category from single word", () => {
    expect(detectCategorySlug("super")).toBe("supermercado");
    expect(detectCategorySlug("verdulería")).toBe("verduleria");
  });

  it("returns null when no category keyword present", () => {
    expect(detectCategorySlug("disponible")).toBeNull();
    expect(detectCategorySlug("hola bot")).toBeNull();
  });
});

describe("hasReimbursementIntent", () => {
  it("is true only when reintegro/reembolso is mentioned", () => {
    expect(hasReimbursementIntent("gasté 5000 con reintegro")).toBe(true);
    expect(hasReimbursementIntent("necesito el reembolso")).toBe(true);
  });

  it("is false for plain expenses (regression: false reimbursement bug)", () => {
    expect(hasReimbursementIntent("Gasté 13568 en super")).toBe(false);
  });
});

describe("detectSimpleQueryIntent", () => {
  it("maps 'disponible' variants to query_available (regression)", () => {
    expect(detectSimpleQueryIntent("Disponible")).toBe("query_available");
    expect(detectSimpleQueryIntent("Disponibles")).toBe("query_available");
    expect(detectSimpleQueryIntent("Disponible súper")).toBe("query_available");
  });

  it("maps resumen and reintegros", () => {
    expect(detectSimpleQueryIntent("resumen")).toBe("query_summary");
    expect(detectSimpleQueryIntent("reintegros")).toBe("query_reimbursements");
  });

  it("does not steal an expense that contains an amount", () => {
    expect(detectSimpleQueryIntent("Gaste 13568 supermercado")).toBeNull();
  });

  it("returns null for unrelated messages", () => {
    expect(detectSimpleQueryIntent("hola")).toBeNull();
  });
});

describe("parseExpenseFallback (integration of the failing screenshots)", () => {
  it("fully parses 'Gaste 13568 supermercado'", () => {
    expect(parseExpenseFallback("Gaste 13568 supermercado")).toEqual({
      amount: 13568,
      categorySlug: "supermercado",
      requiresReimbursement: false,
    });
  });

  it("fully parses 'Gasto en salidas pareja 16739'", () => {
    expect(parseExpenseFallback("Gasto en salidas pareja 16739")).toEqual({
      amount: 16739,
      categorySlug: "salidas_pareja",
      requiresReimbursement: false,
    });
  });

  it("parses category-only messages (conversational flow)", () => {
    expect(parseExpenseFallback("gasto de super")).toEqual({
      amount: null,
      categorySlug: "supermercado",
      requiresReimbursement: false,
    });
  });
});
