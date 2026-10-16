import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { split_session_members, split_sessions, temp_users, users } from "@/lib/db/schema";
import { memberKey, type EditMember } from "@/lib/splits/edit-allocation";
import { SplitAllocationForm } from "../SplitAllocationForm";

export default async function NuevoGastoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = (await headers()).get("x-user-id");
  if (!actorId) notFound();
  const [session, actorMembership, membershipRows] = await Promise.all([
    db.query.split_sessions.findFirst({ where: eq(split_sessions.id, id) }),
    db.query.split_session_members.findFirst({ where: and(eq(split_session_members.session_id, id), eq(split_session_members.user_id, actorId)) }),
    db.select().from(split_session_members).where(eq(split_session_members.session_id, id)),
  ]);
  if (!session || !actorMembership || session.status !== "open") notFound();

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

  return <SplitAllocationForm
    sessionId={id}
    sessionName={session.name}
    description=""
    totalAmount={0}
    splitType="equal"
    members={members}
    payers={[]}
    participants={members.map(member => ({ key: memberKey(member), amount: 0, percentage: null }))}
  />;
}
