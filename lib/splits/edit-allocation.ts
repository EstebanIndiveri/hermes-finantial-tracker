export type EditMember = { userId?: string; tempUserId?: string; label: string };
export type EditSplitType = "equal" | "percentage" | "fixed";

export function memberKey(member: Pick<EditMember, "userId" | "tempUserId">): string {
  return member.userId ? `user:${member.userId}` : `temp:${member.tempUserId}`;
}

/** Accept Argentine amounts (1234,56 or 1.234,56), never float fragments. */
export function parseDecimalCents(raw: string): number | null {
  const match = raw.trim().match(/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/);
  if (!match) return null;
  const [whole, fraction = ""] = raw.trim().replaceAll(".", "").split(",");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function displayCents(cents: number): string {
  const whole = Math.floor(cents / 100).toLocaleString("es-AR");
  const fraction = cents % 100;
  return fraction ? `${whole},${String(fraction).padStart(2, "0")}` : whole;
}

export function distributeEqual(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || count < 1 || count > totalCents) return [];
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, index) => base + (index < totalCents % count ? 1 : 0));
}

/** Largest-remainder rounding is deterministic and conserves every cent. */
export function distributePercent(totalCents: number, basisPoints: number[]): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 ||
      !basisPoints.length || basisPoints.some(p => !Number.isInteger(p) || p <= 0) ||
      basisPoints.reduce((sum, p) => sum + p, 0) !== 10_000) return [];
  const exact = basisPoints.map(p => totalCents * p / 10_000);
  const amounts = exact.map(Math.floor);
  let remainder = totalCents - amounts.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - amounts[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (remainder-- <= 0) break;
    amounts[index]++;
  }
  return amounts.every(value => value > 0) ? amounts : [];
}
