import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notificationPreferences } from "@/lib/db/schema";

export type ProactivePreferenceKind = "dailySummary" | "recurring" | "reimbursements";
export type ProactivePreferences = Record<ProactivePreferenceKind, boolean>;

const disabled: ProactivePreferences = Object.freeze({
  dailySummary: false,
  recurring: false,
  reimbursements: false,
});

/** A missing row is deliberate opt-out. Never infer consent from a linked bot. */
export async function getProactivePreferences(userId: string): Promise<ProactivePreferences> {
  const [row] = await db.select({
    dailySummary: notificationPreferences.dailySummary,
    recurring: notificationPreferences.recurring,
    reimbursements: notificationPreferences.reimbursements,
  }).from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  if (!row) return { ...disabled };
  return {
    dailySummary: row.dailySummary === 1,
    recurring: row.recurring === 1,
    reimbursements: row.reimbursements === 1,
  };
}

export async function hasProactiveConsent(userId: string, kind: ProactivePreferenceKind): Promise<boolean> {
  return (await getProactivePreferences(userId))[kind];
}

/** A single-column upsert avoids lost updates when separate switches race. */
export async function setProactivePreference(
  userId: string,
  kind: ProactivePreferenceKind,
  enabled: boolean,
): Promise<ProactivePreferences> {
  const value = enabled ? 1 : 0;
  const updatedAt = Date.now();
  const base = { userId, updatedAt };
  if (kind === "dailySummary") {
    await db.insert(notificationPreferences).values({ ...base, dailySummary: value })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { dailySummary: value, updatedAt } });
  } else if (kind === "recurring") {
    await db.insert(notificationPreferences).values({ ...base, recurring: value })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { recurring: value, updatedAt } });
  } else {
    await db.insert(notificationPreferences).values({ ...base, reimbursements: value })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { reimbursements: value, updatedAt } });
  }
  return getProactivePreferences(userId);
}
