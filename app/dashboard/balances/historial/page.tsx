import { headers } from "next/headers";
import { HistorialClient } from "./HistorialClient";
import { getPaymentHistoryForUser } from "@/lib/splits/payment-history";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function HistorialPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const hdrs = await headers();
  const userId = hdrs.get("x-user-id");

  const partnerId = typeof params.partnerId === "string" ? params.partnerId : "";
  const from = typeof params.from === "string" ? params.from : "";
  const to = typeof params.to === "string" ? params.to : "";
  const limit = typeof params.limit === "string" ? Number(params.limit) : 20;
  const offset = typeof params.offset === "string" ? Number(params.offset) : 0;

  const history = userId
    ? await getPaymentHistoryForUser(userId, {
        partnerId: partnerId || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: Number.isInteger(limit) && limit > 0 ? limit : 20,
        offset: Number.isInteger(offset) && offset >= 0 ? offset : 0,
      })
    : { items: [], total: 0 };

  const partners = Array.from(
    new Map(history.items.map((item) => [item.partnerId, { id: item.partnerId, name: item.partnerName }])).values(),
  ).filter((partner) => partner.id);

  return (
    <HistorialClient
      initialItems={history.items}
      partners={partners}
      initialFilters={{ partnerId, from, to, limit: Number.isInteger(limit) && limit > 0 ? limit : 20, offset: Number.isInteger(offset) && offset >= 0 ? offset : 0 }}
    />
  );
}
