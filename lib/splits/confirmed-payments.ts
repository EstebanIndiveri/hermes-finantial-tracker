import { and, eq, isNotNull } from "drizzle-orm";
import { split_payments } from "@/lib/db/schema";

// A receipt awaiting confirmation is evidence, not a settlement.
export function confirmedPaymentsForSession(sessionId: string) {
  return and(
    eq(split_payments.session_id, sessionId),
    isNotNull(split_payments.confirmed_at),
  );
}
