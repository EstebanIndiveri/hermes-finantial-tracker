import { displayCents, distributeEqual, distributePercent, parseDecimalCents } from "../edit-allocation";

describe("editor de repartos en centavos", () => {
  test("acepta montos argentinos exactos y rechaza separadores ambiguos", () => {
    expect(parseDecimalCents("1.234,56")).toBe(123456);
    expect(parseDecimalCents("2000")).toBe(200000);
    expect(parseDecimalCents("2,5")).toBe(250);
    expect(parseDecimalCents("2.000.00")).toBeNull();
    expect(parseDecimalCents("2,005")).toBeNull();
    expect(displayCents(123456)).toBe("1.234,56");
  });

  test("iguales conservan centavos y nunca generan cuota cero", () => {
    expect(distributeEqual(101, 2)).toEqual([51, 50]);
    expect(distributeEqual(1, 2)).toEqual([]);
  });

  test("porcentajes usan restos mayores y cierran exactamente", () => {
    expect(distributePercent(101, [5000, 5000])).toEqual([51, 50]);
    expect(distributePercent(100, [3333, 3333, 3334])).toEqual([33, 33, 34]);
    expect(distributePercent(100, [5000, 4000])).toEqual([]);
    expect(distributePercent(1, [5000, 5000])).toEqual([]);
  });
});
