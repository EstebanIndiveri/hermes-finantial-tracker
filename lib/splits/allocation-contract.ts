import { z } from "zod";

const identitySchema = z.object({
  userId: z.string().min(1).optional(),
  tempUserId: z.string().min(1).optional(),
}).refine(value => Boolean(value.userId) !== Boolean(value.tempUserId), {
  message: "Exactly one identity is required",
});

const participantSchema = identitySchema.safeExtend({
  amount: z.number().positive(),
  percentage: z.number().optional(),
});

const payerSchema = identitySchema.safeExtend({
  amountPaid: z.number().positive(),
});

export const splitAllocationSchema = z.object({
  totalAmount: z.number().positive(),
  splitType: z.enum(["equal", "percentage", "fixed"]),
  payers: z.array(payerSchema).min(1),
  participants: z.array(participantSchema).min(1),
});

export type SplitAllocation = z.infer<typeof splitAllocationSchema>;

function toCents(amount: number): number | null {
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && Number.isSafeInteger(cents) &&
    Math.abs(amount * 100 - cents) < 1e-7 ? cents : null;
}

export function allocationIdentity(value: { userId?: string; tempUserId?: string }): string {
  return value.userId ? `user:${value.userId}` : `temp:${value.tempUserId}`;
}

/** Checks conservation in cents and split-type semantics before any DB write. */
export function validSplitAllocation(input: SplitAllocation): boolean {
  const total = toCents(input.totalAmount);
  if (total === null || total <= 0) return false;
  for (const entries of [input.payers, input.participants]) {
    if (new Set(entries.map(allocationIdentity)).size !== entries.length) return false;
  }
  const paid = input.payers.map(p => toCents(p.amountPaid));
  const owed = input.participants.map(p => toCents(p.amount));
  if ([...paid, ...owed].some(value => value === null || value <= 0)) return false;
  if (paid.reduce<number>((sum, value) => sum + (value ?? 0), 0) !== total ||
      owed.reduce<number>((sum, value) => sum + (value ?? 0), 0) !== total) return false;

  if (input.splitType !== "percentage" &&
      input.participants.some(p => p.percentage !== undefined)) return false;
  if (input.splitType === "equal") {
    let smallest = total;
    let largest = 0;
    for (const amount of owed) {
      smallest = Math.min(smallest, amount ?? 0);
      largest = Math.max(largest, amount ?? 0);
    }
    return largest - smallest <= 1;
  }
  if (input.splitType === "fixed") return true;

  const basisPoints = input.participants.map(p =>
    p.percentage === undefined ? null : toCents(p.percentage));
  if (basisPoints.some(value => value === null || value <= 0) ||
      basisPoints.reduce<number>((sum, value) => sum + (value ?? 0), 0) !== 10_000) return false;
  return owed.every((value, index) =>
    Math.abs((value ?? 0) - Math.round(total * (basisPoints[index] ?? 0) / 10_000)) <= 1);
}
