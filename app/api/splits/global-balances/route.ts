import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { verifySession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { temp_users, users } from "@/lib/db/schema";
import { calculateGlobalBalances } from "@/lib/splits/global-balances";
import type { GlobalBalanceSummary, ParticipantId } from "@/lib/splits/types";

const UNKNOWN_PARTNER_NAME = "Usuario desconocido";

type SessionUser = { id: string; name: string };
type SessionTempUser = { id: string; first_name: string; last_name: string | null };
type SessionPayload = { user: { id: string } };

async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await import("next/headers").then(({ cookies }) => cookies());
  const token = cookieStore.get("hermes_session")?.value;
  const userId = token ? await verifySession(token) : null;

  if (!userId) {
    return null;
  }

  return { user: { id: userId } };
}

function getPartnerLabel(partner: ParticipantId, userMap: Map<string, string>, tempUserMap: Map<string, string>): string {
  if (partner.userId) {
    return userMap.get(partner.userId) ?? UNKNOWN_PARTNER_NAME;
  }

  if (partner.tempUserId) {
    return tempUserMap.get(partner.tempUserId) ?? UNKNOWN_PARTNER_NAME;
  }

  return UNKNOWN_PARTNER_NAME;
}

function formatTempUserName(tempUser: SessionTempUser): string {
  const fullName = [tempUser.first_name, tempUser.last_name].filter(Boolean).join(" ").trim();
  return fullName || UNKNOWN_PARTNER_NAME;
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await calculateGlobalBalances(session.user.id);
    const userIds = Array.from(new Set(summary.partnerBalances.flatMap((balance) => balance.partner.userId ? [balance.partner.userId] : [])));
    const tempUserIds = Array.from(new Set(summary.partnerBalances.flatMap((balance) => balance.partner.tempUserId ? [balance.partner.tempUserId] : [])));

    const [partnerUsers, partnerTempUsers] = await Promise.all([
      userIds.length === 0
        ? Promise.resolve<SessionUser[]>([])
        : db.query.users.findMany({
            where: inArray(users.id, userIds),
            columns: { id: true, name: true },
          }) as Promise<SessionUser[]>,
      tempUserIds.length === 0
        ? Promise.resolve<SessionTempUser[]>([])
        : db.query.temp_users.findMany({
            where: inArray(temp_users.id, tempUserIds),
            columns: { id: true, first_name: true, last_name: true },
          }) as Promise<SessionTempUser[]>,
    ]);

    const userMap = new Map(partnerUsers.map((partner) => [partner.id, partner.name]));
    const tempUserMap = new Map(partnerTempUsers.map((partner) => [partner.id, formatTempUserName(partner)]));

    const response: GlobalBalanceSummary = {
      ...summary,
      partnerBalances: summary.partnerBalances.map((balance) => ({
        ...balance,
        partnerName: getPartnerLabel(balance.partner, userMap, tempUserMap),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching global balances:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
