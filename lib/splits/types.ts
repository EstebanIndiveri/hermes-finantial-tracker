/** Identifies a participant — either a Hermes user or a temp user */
export interface ParticipantId {
  userId?: string;
  tempUserId?: string;
}

/** Display info for a participant */
export interface Participant extends ParticipantId {
  name: string;
  telegramUsername?: string;
  isTemp: boolean;
}

/** Raw payer record from DB */
export interface RawPayer extends ParticipantId {
  amountPaid: number;
}

/** Raw split item record from DB */
export interface RawItem extends ParticipantId {
  amountOwed: number;
}

/** Raw payment record from DB */
export interface RawPayment {
  payerUserId?: string | null;
  payerTempId?: string | null;
  payeeUserId?: string | null;
  payeeTempId?: string | null;
  amount: number;
}

/** Balance neto de un participante en una sesión */
export interface Balance extends ParticipantId {
  /** Positivo = le deben, negativo = debe */
  net: number;
}

/** Deuda simplificada: quién le paga a quién cuánto */
export interface Debt {
  from: ParticipantId;
  to: ParticipantId;
  amount: number;
}

/** Global debt summary across all sessions */
export interface GlobalDebt extends Debt {
  /** Session IDs that contribute to this debt */
  sessionIds: string[];
}

/** Partner balance summary */
export interface PartnerBalance {
  partner: ParticipantId;
  partnerName?: string;
  /** Positive = they owe you, negative = you owe them */
  net: number;
  /** Per-session breakdown */
  sessionBreakdown: Array<{
    sessionId: string;
    sessionName: string;
    net: number;
  }>;
}

/** Global balance summary for a user */
export interface GlobalBalanceSummary {
  /** Balances with each partner */
  partnerBalances: PartnerBalance[];
  /** Simplified debts you owe */
  youOwe: GlobalDebt[];
  /** Simplified debts others owe you */
  theyOwe: GlobalDebt[];
  /** Total you owe */
  totalYouOwe: number;
  /** Total they owe you */
  totalTheyOwe: number;
}

/** Resumen de balances para una sesión */
export interface SessionBalanceSummary {
  balances: Balance[];
  debts: Debt[];
  isSettled: boolean;
}

/** Key para identificar un participante de forma consistente */
export function participantKey(p: ParticipantId): string {
  return p.userId ? `user:${p.userId}` : `temp:${p.tempUserId}`;
}
