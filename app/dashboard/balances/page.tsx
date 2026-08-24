import { headers } from "next/headers";
import { BalancesClient } from "./BalancesClient";
import { calculateGlobalBalances } from "@/lib/splits/global-balances";

export const dynamic = "force-dynamic";

export default async function BalancesPage() {
  const hdrs = await headers();
  const userId = hdrs.get("x-user-id");

  const initialSummary = userId
    ? await calculateGlobalBalances(userId)
    : { partnerBalances: [], youOwe: [], theyOwe: [], totalYouOwe: 0, totalTheyOwe: 0 };

  return <BalancesClient initialSummary={initialSummary} />;
}
