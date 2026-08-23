import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { split_sessions, splits, split_session_members } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { CompartidosClient } from "./CompartidosClient";

export const dynamic = "force-dynamic";

async function getSessions() {
  try {
    const hdrs = await headers();
    const userId = hdrs.get("x-user-id");
    if (!userId) return [];

    const sessionRows = await db.query.split_sessions.findMany({
      where: eq(split_sessions.owner_user_id, userId),
      orderBy: (t, { desc }) => desc(t.created_at),
    });

    if (sessionRows.length === 0) return [];

    const ids = sessionRows.map(s => s.id);

    const [splitsRows, membersRows] = await Promise.all([
      db.select({ session_id: splits.session_id }).from(splits).where(inArray(splits.session_id, ids)),
      db.select({ session_id: split_session_members.session_id }).from(split_session_members).where(inArray(split_session_members.session_id, ids)),
    ]);

    const splitsCount: Record<string, number> = {};
    const membersCount: Record<string, number> = {};
    for (const r of splitsRows) splitsCount[r.session_id] = (splitsCount[r.session_id] ?? 0) + 1;
    for (const r of membersRows) membersCount[r.session_id] = (membersCount[r.session_id] ?? 0) + 1;

    return sessionRows.map(s => ({
      ...s,
      splits_count: splitsCount[s.id] ?? 0,
      members_count: membersCount[s.id] ?? 1,
    }));
  } catch {
    return [];
  }
}

export default async function CompartidosPage() {
  const sessions = await getSessions();
  return <CompartidosClient sessions={sessions} />;
}
