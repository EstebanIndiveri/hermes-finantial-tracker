import { payableSessionAmount, payableSessions } from "../payment-session";

describe("payable split sessions", () => {
  const partner = {
    partner: { userId: "creditor" },
    net: -500,
    sessionBreakdown: [
      { sessionId: "debt-a", sessionName: "Viaje", net: -1000.01 },
      { sessionId: "credit-b", sessionName: "Cena", net: 500.01 },
      { sessionId: "settled-c", sessionName: "Supermercado", net: 0 },
    ],
  };

  it("shows only per-session debts and keeps cents exact", () => {
    expect(payableSessions(partner)).toEqual([{ sessionId: "debt-a", label: "Viaje", amount: 1000.01 }]);
  });

  it("refuses a credit or absent session as payment target", () => {
    expect(payableSessionAmount(partner, "credit-b")).toBeNull();
    expect(payableSessionAmount(partner, "absent")).toBeNull();
    expect(payableSessionAmount(partner, "debt-a")).toBe(1000.01);
  });
});
