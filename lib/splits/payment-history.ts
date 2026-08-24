import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { split_payments, split_sessions } from "@/lib/db/schema";

export interface PaymentHistoryFilters {
  partnerId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface PaymentHistoryItem {
  id: string;
  date: number;
  amount: number;
  partnerId: string;
  partnerName: string;
  sessionId: string;
  sessionName: string;
  direction: "sent" | "received";
}

export interface PaymentHistoryResult {
  items: PaymentHistoryItem[];
  total: number;
}

function startOfDay(value: string): number {
  return new Date(`${value}T00:00:00.000-03:00`).getTime();
}

function endOfDay(value: string): number {
  return new Date(`${value}T23:59:59.999-03:00`).getTime();
}

export async function getPaymentHistoryForUser(
  userId: string,
  filters: PaymentHistoryFilters = {},
): Promise<PaymentHistoryResult> {
  const conditions = [
    or(eq(split_payments.payer_user_id, userId), eq(split_payments.payee_user_id, userId)),
  ];

  if (filters.partnerId) {
    conditions.push(
      or(
        and(eq(split_payments.payer_user_id, userId), eq(split_payments.payee_user_id, filters.partnerId)),
        and(eq(split_payments.payee_user_id, userId), eq(split_payments.payer_user_id, filters.partnerId)),
        and(eq(split_payments.payer_user_id, userId), eq(split_payments.payee_temp_id, filters.partnerId)),
        and(eq(split_payments.payee_user_id, userId), eq(split_payments.payer_temp_id, filters.partnerId)),
      )!,
    );
  }

  if (filters.from) {
    conditions.push(gte(split_payments.confirmed_at, startOfDay(filters.from)));
  }

  if (filters.to) {
    conditions.push(lte(split_payments.confirmed_at, endOfDay(filters.to)));
  }

  const whereClause = and(...conditions);
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: split_payments.id,
        date: split_payments.confirmed_at,
        amount: split_payments.amount,
        sessionId: split_sessions.id,
        sessionName: split_sessions.name,
        partnerId: sql<string>`coalesce(case when ${split_payments.payer_user_id} = ${userId} then ${split_payments.payee_user_id} else ${split_payments.payer_user_id} end, case when ${split_payments.payer_user_id} = ${userId} then ${split_payments.payee_temp_id} else ${split_payments.payer_temp_id} end, '')`,
        partnerName: sql<string>`coalesce((select name from users where id = case when ${split_payments.payer_user_id} = ${userId} then ${split_payments.payee_user_id} else ${split_payments.payer_user_id} end), (select first_name from temp_users where id = case when ${split_payments.payer_user_id} = ${userId} then ${split_payments.payee_temp_id} else ${split_payments.payer_temp_id} end), 'Usuario desconocido')`,
        direction: sql<"sent" | "received">`case when ${split_payments.payer_user_id} = ${userId} then 'sent' else 'received' end`,
      })
      .from(split_payments)
      .innerJoin(split_sessions, eq(split_sessions.id, split_payments.session_id))
      .where(whereClause)
      .orderBy(desc(split_payments.confirmed_at))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(split_payments)
      .where(whereClause),
  ]);

  return {
    items: rows
      .filter((row) => typeof row.date === "number")
      .map((row) => ({
        id: row.id,
        date: row.date as number,
        amount: row.amount,
        partnerId: row.partnerId,
        partnerName: row.partnerName,
        sessionId: row.sessionId,
        sessionName: row.sessionName,
        direction: row.direction,
      })),
    total: totalRows[0]?.count ?? 0,
  };
}
