import { db } from "@/lib/db/client";
import { userPaymentInfo } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export type PaymentMethod = "cbu" | "alias" | "efectivo";

export interface PaymentInfo {
  id: string;
  userId: string;
  paymentMethod: PaymentMethod;
  value: string | null;
  isDefault: boolean;
}

type PaymentInfoRow = {
  id: string;
  userId: string;
  paymentMethod: string;
  value: string | null;
  isDefault: boolean | null;
};

function mapPaymentInfoRow(row: PaymentInfoRow): PaymentInfo {
  return {
    id: row.id,
    userId: row.userId,
    paymentMethod: row.paymentMethod as PaymentMethod,
    value: row.value,
    isDefault: row.isDefault ?? false,
  };
}

export async function getUserPaymentInfo(userId: string): Promise<PaymentInfo[]> {
  const rows = await db.select().from(userPaymentInfo).where(eq(userPaymentInfo.userId, userId));
  return rows.map(mapPaymentInfoRow);
}

export async function getDefaultPaymentInfo(userId: string): Promise<PaymentInfo | null> {
  const [info] = await db
    .select()
    .from(userPaymentInfo)
    .where(and(eq(userPaymentInfo.userId, userId), eq(userPaymentInfo.isDefault, true)));

  return info ? mapPaymentInfoRow(info) : null;
}

export async function addPaymentInfo(
  userId: string,
  method: PaymentMethod,
  value: string | null,
  isDefault = false,
): Promise<PaymentInfo> {
  const id = nanoid();

  const info = await db.transaction(async (tx) => {
    if (isDefault) {
      await tx.update(userPaymentInfo).set({ isDefault: false }).where(eq(userPaymentInfo.userId, userId));
    }

    const [inserted] = await tx
      .insert(userPaymentInfo)
      .values({
        id,
        userId,
        paymentMethod: method,
        value,
        isDefault,
      })
      .returning();

    return inserted;
  });

  return mapPaymentInfoRow(info);
}

export async function deletePaymentInfo(id: string, userId: string): Promise<boolean> {
  const deletedRows = await db
    .delete(userPaymentInfo)
    .where(and(eq(userPaymentInfo.id, id), eq(userPaymentInfo.userId, userId)))
    .returning();

  return deletedRows.length > 0;
}
