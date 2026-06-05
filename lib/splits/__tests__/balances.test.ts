// lib/splits/__tests__/balances.test.ts
import { calculateSessionBalances } from "../balances";
import type { RawPayer, RawItem, RawPayment } from "../types";

const U1 = { userId: "u1" };
const U2 = { userId: "u2" };
const U3 = { userId: "u3" };
const T1 = { tempUserId: "t1" };

describe("calculateSessionBalances", () => {
  describe("happy path", () => {
    it("single payer, equal split 2 people — payer net positive", () => {
      // u1 paid $1000, both owe $500
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...U2, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [];

      const result = calculateSessionBalances(payers, items, payments);
      const u1 = result.balances.find(b => b.userId === "u1")!;
      const u2 = result.balances.find(b => b.userId === "u2")!;

      expect(u1.net).toBeCloseTo(500);   // paid 1000, owes 500 → net +500
      expect(u2.net).toBeCloseTo(-500);  // paid 0, owes 500 → net -500
      expect(result.isSettled).toBe(false);
    });

    it("single payer, equal split 3 people — correct debts", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 3000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 1000 },
        { ...U2, amountOwed: 1000 },
        { ...U3, amountOwed: 1000 },
      ];
      const payments: RawPayment[] = [];

      const result = calculateSessionBalances(payers, items, payments);
      expect(result.debts).toHaveLength(2);
      expect(result.debts.every(d => d.amount === 1000)).toBe(true);
      expect(result.isSettled).toBe(false);
    });

    it("multiple payers with different amounts", () => {
      // ticket $3000: u1 put $1000, u2 put $2000, u3 put $0
      // equal split → each owes $1000
      // u1: paid 1000, owes 1000 → net 0
      // u2: paid 2000, owes 1000 → net +1000
      // u3: paid 0, owes 1000 → net -1000
      const payers: RawPayer[] = [
        { ...U1, amountPaid: 1000 },
        { ...U2, amountPaid: 2000 },
      ];
      const items: RawItem[] = [
        { ...U1, amountOwed: 1000 },
        { ...U2, amountOwed: 1000 },
        { ...U3, amountOwed: 1000 },
      ];
      const payments: RawPayment[] = [];

      const result = calculateSessionBalances(payers, items, payments);
      const u1 = result.balances.find(b => b.userId === "u1")!;
      const u2 = result.balances.find(b => b.userId === "u2")!;
      const u3 = result.balances.find(b => b.userId === "u3")!;

      expect(u1.net).toBeCloseTo(0);
      expect(u2.net).toBeCloseTo(1000);
      expect(u3.net).toBeCloseTo(-1000);
      expect(result.debts).toHaveLength(1);
      expect(result.debts[0].from.userId).toBe("u3");
      expect(result.debts[0].to.userId).toBe("u2");
      expect(result.debts[0].amount).toBeCloseTo(1000);
    });

    it("payment reduces debt correctly", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...U2, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [{
        payerUserId: "u2", payerTempId: null,
        payeeUserId: "u1", payeeTempId: null,
        amount: 300,
      }];

      const result = calculateSessionBalances(payers, items, payments);
      const u2 = result.balances.find(b => b.userId === "u2")!;
      expect(u2.net).toBeCloseTo(-200); // owes 500, paid 300 → still owes 200
    });

    it("fully settled session returns isSettled true", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...U2, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [{
        payerUserId: "u2", payerTempId: null,
        payeeUserId: "u1", payeeTempId: null,
        amount: 500,
      }];

      const result = calculateSessionBalances(payers, items, payments);
      expect(result.isSettled).toBe(true);
      expect(result.debts).toHaveLength(0);
    });

    it("temp_user participates correctly", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...T1, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [];

      const result = calculateSessionBalances(payers, items, payments);
      const t1 = result.balances.find(b => b.tempUserId === "t1")!;
      expect(t1.net).toBeCloseTo(-500);
    });

    it("partial payment leaves remaining debt", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 500 },
        { ...U2, amountOwed: 500 },
      ];
      const payments: RawPayment[] = [{
        payerUserId: "u2", payerTempId: null,
        payeeUserId: "u1", payeeTempId: null,
        amount: 200,
      }];

      const result = calculateSessionBalances(payers, items, payments);
      expect(result.debts).toHaveLength(1);
      expect(result.debts[0].amount).toBeCloseTo(300);
      expect(result.isSettled).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("empty session returns empty balances and settled", () => {
      const result = calculateSessionBalances([], [], []);
      expect(result.balances).toHaveLength(0);
      expect(result.debts).toHaveLength(0);
      expect(result.isSettled).toBe(true);
    });

    it("single participant is always settled", () => {
      const payers: RawPayer[] = [{ ...U1, amountPaid: 1000 }];
      const items: RawItem[] = [{ ...U1, amountOwed: 1000 }];
      const result = calculateSessionBalances(payers, items, []);
      expect(result.isSettled).toBe(true);
    });

    it("4 people minimizes to 3 transactions", () => {
      // u1 paid everything for 4 people
      const payers: RawPayer[] = [{ ...U1, amountPaid: 4000 }];
      const items: RawItem[] = [
        { ...U1, amountOwed: 1000 },
        { ...U2, amountOwed: 1000 },
        { ...U3, amountOwed: 1000 },
        { userId: "u4", amountOwed: 1000 },
      ];
      const result = calculateSessionBalances(payers, items, []);
      expect(result.debts).toHaveLength(3);
      expect(result.debts.every(d => d.to.userId === "u1")).toBe(true);
    });
  });
});
