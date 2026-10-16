import type { PartnerBalance } from "./types";

export interface PayableSession {
  sessionId: string;
  label: string;
  amount: number;
}

export function payableSessions(partner: PartnerBalance): PayableSession[] {
  return partner.sessionBreakdown.flatMap((session) => {
    const cents = Math.round(-session.net * 100);
    return cents > 0
      ? [{ sessionId: session.sessionId, label: session.sessionName, amount: cents / 100 }]
      : [];
  });
}

export function payableSessionAmount(partner: PartnerBalance, sessionId: string): number | null {
  return payableSessions(partner).find((session) => session.sessionId === sessionId)?.amount ?? null;
}
