import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { split_items, split_payers, split_payments, split_session_members, split_sessions, splits } from "@/lib/db/schema";
import { calculateSessionBalances } from "./balances";
import { participantKey, type GlobalBalanceSummary, type GlobalDebt, type PartnerBalance, type ParticipantId, type RawItem, type RawPayer, type RawPayment } from "./types";

type SessionRecord = {
  id: string;
  name: string;
};

type SessionContribution = {
  sessionId: string;
  sessionName: string;
  net: number;
};

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function calculateGlobalBalances(userId: string): Promise<GlobalBalanceSummary> {
  const ownedSessionsPromise = db.query.split_sessions.findMany({
    where: eq(split_sessions.owner_user_id, userId),
  });

  const memberSessionsPromise = db.select({
    id: split_sessions.id,
    name: split_sessions.name,
  })
    .from(split_sessions)
    .innerJoin(split_session_members, eq(split_session_members.session_id, split_sessions.id))
    .where(eq(split_session_members.user_id, userId)) as Promise<Array<{ id: string; name: string }>>;

  const [ownedSessions, memberSessions] = await Promise.all([ownedSessionsPromise, memberSessionsPromise]);

  const sessionMap = new Map<string, SessionRecord>();
  for (const session of ownedSessions) {
    sessionMap.set(session.id, { id: session.id, name: session.name });
  }
  for (const row of memberSessions) {
    sessionMap.set(row.id, { id: row.id, name: row.name });
  }

  if (sessionMap.size === 0) {
    return {
      partnerBalances: [],
      youOwe: [],
      theyOwe: [],
      totalYouOwe: 0,
      totalTheyOwe: 0,
    };
  }

  const partnerMap = new Map<string, { partner: ParticipantId; net: number; sessionBreakdown: SessionContribution[] }>();

  for (const session of sessionMap.values()) {
    const activeSplits = await db.query.splits.findMany({
      where: and(eq(splits.session_id, session.id), eq(splits.status, "active")),
    });

    const splitIds = activeSplits.map((split) => split.id);
    const [payerRows, itemRows, paymentRows] = splitIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          db.select().from(split_payers).where(inArray(split_payers.split_id, splitIds)),
          db.select().from(split_items).where(inArray(split_items.split_id, splitIds)),
          db.select().from(split_payments).where(eq(split_payments.session_id, session.id)),
        ]);

    const rawPayers: RawPayer[] = payerRows.map((row) => ({
      userId: row.user_id ?? undefined,
      tempUserId: row.temp_user_id ?? undefined,
      amountPaid: row.amount_paid,
    }));
    const rawItems: RawItem[] = itemRows.map((row) => ({
      userId: row.user_id ?? undefined,
      tempUserId: row.temp_user_id ?? undefined,
      amountOwed: row.amount_owed,
    }));
    const rawPayments: RawPayment[] = paymentRows.map((row) => ({
      payerUserId: row.payer_user_id ?? undefined,
      payerTempId: row.payer_temp_id ?? undefined,
      payeeUserId: row.payee_user_id ?? undefined,
      payeeTempId: row.payee_temp_id ?? undefined,
      amount: row.amount,
    }));

    const summary = calculateSessionBalances(rawPayers, rawItems, rawPayments);

    for (const balance of summary.balances) {
      if (balance.userId === userId) {
        continue;
      }

      const partner: ParticipantId = balance.userId ? { userId: balance.userId } : { tempUserId: balance.tempUserId };
      const sessionNet = roundAmount(-balance.net);
      if (Math.abs(sessionNet) < 0.01) {
        continue;
      }

      const key = participantKey(partner);
      const current = partnerMap.get(key) ?? { partner, net: 0, sessionBreakdown: [] };
      current.net = roundAmount(current.net + sessionNet);
      current.sessionBreakdown.push({
        sessionId: session.id,
        sessionName: session.name,
        net: sessionNet,
      });
      partnerMap.set(key, current);
    }
  }

  const partnerBalances: PartnerBalance[] = Array.from(partnerMap.values())
    .map(({ partner, net, sessionBreakdown }) => ({
      partner,
      partnerName: undefined,
      net: roundAmount(net),
      sessionBreakdown: sessionBreakdown.sort((a, b) => a.sessionName.localeCompare(b.sessionName)),
    }))
    .filter((balance) => Math.abs(balance.net) >= 0.01)
    .sort((a, b) => participantKey(a.partner).localeCompare(participantKey(b.partner)));

  const youOwe: GlobalDebt[] = [];
  const theyOwe: GlobalDebt[] = [];

  for (const balance of partnerBalances) {
    const sessionIds = Array.from(new Set(balance.sessionBreakdown.map((entry) => entry.sessionId)));
    if (balance.net < 0) {
      youOwe.push({
        from: { userId },
        to: balance.partner,
        amount: roundAmount(Math.abs(balance.net)),
        sessionIds,
      });
      continue;
    }

    theyOwe.push({
      from: balance.partner,
      to: { userId },
      amount: roundAmount(balance.net),
      sessionIds,
    });
  }

  const totalYouOwe = roundAmount(youOwe.reduce((sum, debt) => sum + debt.amount, 0));
  const totalTheyOwe = roundAmount(theyOwe.reduce((sum, debt) => sum + debt.amount, 0));

  return {
    partnerBalances,
    youOwe,
    theyOwe,
    totalYouOwe,
    totalTheyOwe,
  };
}
