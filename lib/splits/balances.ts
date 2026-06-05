// lib/splits/balances.ts
import type { RawPayer, RawItem, RawPayment, Balance, Debt, SessionBalanceSummary, ParticipantId } from "./types";
import { participantKey } from "./types";

/**
 * Calculates net balances for a session and simplifies debts.
 * Positive net = others owe you. Negative net = you owe others.
 */
export function calculateSessionBalances(
  payers: RawPayer[],
  items: RawItem[],
  payments: RawPayment[]
): SessionBalanceSummary {
  const netMap = new Map<string, { id: ParticipantId; net: number }>();

  function getOrCreate(id: ParticipantId) {
    const key = participantKey(id);
    if (!netMap.has(key)) netMap.set(key, { id, net: 0 });
    return netMap.get(key)!;
  }

  // Add what each person paid
  for (const p of payers) {
    const id: ParticipantId = p.userId ? { userId: p.userId } : { tempUserId: p.tempUserId };
    getOrCreate(id).net += p.amountPaid;
  }

  // Subtract what each person owes
  for (const item of items) {
    const id: ParticipantId = item.userId ? { userId: item.userId } : { tempUserId: item.tempUserId };
    getOrCreate(id).net -= item.amountOwed;
  }

  // Process payments: payer reduces debt, payee reduces claim
  for (const payment of payments) {
    if (payment.payerUserId || payment.payerTempId) {
      const payerId: ParticipantId = payment.payerUserId
        ? { userId: payment.payerUserId }
        : { tempUserId: payment.payerTempId! };
      getOrCreate(payerId).net += payment.amount;
    }
    if (payment.payeeUserId || payment.payeeTempId) {
      const payeeId: ParticipantId = payment.payeeUserId
        ? { userId: payment.payeeUserId }
        : { tempUserId: payment.payeeTempId! };
      getOrCreate(payeeId).net -= payment.amount;
    }
  }

  const balances: Balance[] = Array.from(netMap.values()).map(({ id, net }) => ({
    ...id,
    net: Math.round(net * 100) / 100,
  }));

  const debts = simplifyDebts(balances);
  const isSettled = debts.length === 0;

  return { balances, debts, isSettled };
}

/**
 * Simplifies debts to the minimum number of transactions (greedy algorithm).
 */
export function simplifyDebts(balances: Balance[]): Debt[] {
  const EPSILON = 0.01;
  const creditors = balances
    .filter(b => b.net > EPSILON)
    .map(b => ({ id: { userId: b.userId, tempUserId: b.tempUserId }, amount: b.net }));
  const debtors = balances
    .filter(b => b.net < -EPSILON)
    .map(b => ({ id: { userId: b.userId, tempUserId: b.tempUserId }, amount: -b.net }));

  const debts: Debt[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    debts.push({
      from: debtor.id,
      to: creditor.id,
      amount: Math.round(amount * 100) / 100,
    });

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount < EPSILON) ci++;
    if (debtor.amount < EPSILON) di++;
  }

  return debts;
}
