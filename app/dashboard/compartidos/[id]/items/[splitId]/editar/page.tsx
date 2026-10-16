import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { split_items, split_payers, split_payments, split_session_members, split_sessions, splits, temp_users, users } from "@/lib/db/schema";
import { memberKey, type EditMember } from "@/lib/splits/edit-allocation";
import { SplitAllocationForm } from "../../../SplitAllocationForm";

export default async function EditSplitPage({ params }: { params: Promise<{ id: string; splitId: string }> }) {
  const { id, splitId } = await params;
  const actorId = (await headers()).get("x-user-id");
  if (!actorId) notFound();

  const [session, split, actorMembership, payment] = await Promise.all([
    db.query.split_sessions.findFirst({ where: eq(split_sessions.id, id) }),
    db.query.splits.findFirst({ where: and(eq(splits.id, splitId), eq(splits.session_id, id)) }),
    db.query.split_session_members.findFirst({ where: and(eq(split_session_members.session_id, id), eq(split_session_members.user_id, actorId)) }),
    db.query.split_payments.findFirst({ where: eq(split_payments.session_id, id) }),
  ]);
  if (!session || !split || !actorMembership || session.owner_user_id !== actorId ||
      session.status !== "open" || split.status !== "active" || payment) notFound();

  const [membershipRows, payerRows, itemRows] = await Promise.all([
    db.select().from(split_session_members).where(eq(split_session_members.session_id, id)),
    db.select().from(split_payers).where(eq(split_payers.split_id, splitId)),
    db.select().from(split_items).where(eq(split_items.split_id, splitId)),
  ]);
  const userIds = membershipRows.flatMap(row => row.user_id ? [row.user_id] : []);
  const tempIds = membershipRows.flatMap(row => row.temp_user_id ? [row.temp_user_id] : []);
  const [userRows, tempRows] = await Promise.all([
    userIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [],
    tempIds.length ? db.select({ id: temp_users.id, first_name: temp_users.first_name, last_name: temp_users.last_name }).from(temp_users).where(inArray(temp_users.id, tempIds)) : [],
  ]);
  const userNames = new Map(userRows.map(row => [row.id, row.name]));
  const tempNames = new Map(tempRows.map(row => [row.id, [row.first_name, row.last_name].filter(Boolean).join(" ")]));
  const members = membershipRows.flatMap<EditMember>(row => {
    if (row.user_id && userNames.has(row.user_id)) return [{ userId: row.user_id, label: userNames.get(row.user_id)! }];
    if (row.temp_user_id && tempNames.has(row.temp_user_id)) return [{ tempUserId: row.temp_user_id, label: tempNames.get(row.temp_user_id)! }];
    return [];
  });
  const memberKeys = new Set(members.map(memberKey));
  // Historical identities no longer in the session must not be silently dropped.
  if ([...payerRows, ...itemRows].some(row => !memberKeys.has(memberKey({ userId: row.user_id ?? undefined, tempUserId: row.temp_user_id ?? undefined })))) notFound();

  return <SplitAllocationForm
    sessionId={id}
    splitId={splitId}
    sessionName={session.name}
    description={split.description}
    totalAmount={split.total_amount}
    splitType={split.split_type}
    members={members}
    payers={payerRows.map(row => ({ key: memberKey({ userId: row.user_id ?? undefined, tempUserId: row.temp_user_id ?? undefined }), amount: row.amount_paid }))}
    participants={itemRows.map(row => ({ key: memberKey({ userId: row.user_id ?? undefined, tempUserId: row.temp_user_id ?? undefined }), amount: row.amount_owed, percentage: row.percentage }))}
  />;
}
