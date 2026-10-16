import { allocationIdentity, type SplitAllocation } from "./allocation-contract";

type StoredSplit = {
  session_id: string;
  created_by_user_id: string | null;
  status: string;
  description: string;
  total_amount: number;
  split_type: string;
};
type StoredPayer = { user_id: string | null; temp_user_id: string | null; amount_paid: number };
type StoredItem = { user_id: string | null; temp_user_id: string | null; amount_owed: number; percentage: number | null };

const cents = (value: number) => Math.round(value * 100);
const identity = (row: { user_id: string | null; temp_user_id: string | null }) =>
  row.user_id ? `user:${row.user_id}` : `temp:${row.temp_user_id}`;

/** Compare the durable financial projection, independent of insertion order. */
export function matchesWebSplitReplay(
  existing: StoredSplit,
  payers: StoredPayer[],
  items: StoredItem[],
  request: SplitAllocation & { description: string },
  sessionId: string,
  actorId: string,
): boolean {
  if (existing.session_id !== sessionId || existing.created_by_user_id !== actorId ||
      existing.status !== "active" || existing.description !== request.description ||
      existing.split_type !== request.splitType || cents(existing.total_amount) !== cents(request.totalAmount)) return false;

  const storedPayers = payers.map(row => `${identity(row)}:${cents(row.amount_paid)}`).sort();
  const askedPayers = request.payers.map(row => `${allocationIdentity(row)}:${cents(row.amountPaid)}`).sort();
  const storedItems = items.map(row => `${identity(row)}:${cents(row.amount_owed)}:${row.percentage === null ? "" : cents(row.percentage)}`).sort();
  const askedItems = request.participants.map(row => `${allocationIdentity(row)}:${cents(row.amount)}:${row.percentage === undefined ? "" : cents(row.percentage)}`).sort();
  return storedPayers.length === askedPayers.length && storedItems.length === askedItems.length &&
    storedPayers.every((row, index) => row === askedPayers[index]) &&
    storedItems.every((row, index) => row === askedItems[index]);
}
