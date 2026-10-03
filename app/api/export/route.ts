import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { transactions, budgets, categories, monthly_settings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateCSV, generateXLSX } from "@/lib/export/generate";
import type { ExportTransaction, ExportCategory } from "@/lib/export/generate";
import { getGroupMembership } from "@/lib/groups/permissions";
import { isIncomeCategory } from "@/lib/finance/income";

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const hdrs = await headers();
  const userId = hdrs.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = hdrs.get("x-group-id");
  if (!groupId) {
    return NextResponse.json({ error: "No active group" }, { status: 400 });
  }

  const membership = await getGroupMembership(userId, groupId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month") ?? "";
  const format = searchParams.get("format") ?? "";

  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: "Parámetro month inválido. Usar formato YYYY-MM." }, { status: 400 });
  }
  const monthNum = month.slice(5, 7);
  if (monthNum < "01" || monthNum > "12") {
    return NextResponse.json({ error: "Mes inválido. Usar valores entre 01 y 12." }, { status: 400 });
  }
  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json({ error: "Parámetro format inválido. Usar csv o xlsx." }, { status: 400 });
  }

  try {
    const settings = await db.query.monthly_settings.findFirst({
      where: and(eq(monthly_settings.group_id, groupId), eq(monthly_settings.month, month)),
    });
    const mode = settings?.currency_mode;
    if (!settings || (mode !== "USD_ARS" && mode !== "ARS_ARS") ||
      (mode === "ARS_ARS" && process.env.ACT05_ARS_MODE_ENABLED !== "true")) {
      return NextResponse.json({ error: "Configuración monetaria del mes no disponible." }, { status: 409 });
    }

    const txRows = await db.query.transactions.findMany({
      where: and(
        eq(transactions.group_id, groupId),
        eq(transactions.month, month),
        eq(transactions.status, "active"),
      ),
      orderBy: (t, { asc }) => asc(t.date),
      with: { category: true },
    });

    // The export must reconcile with the persisted accounting view. A missing
    // USD value is not ARS converted at today's rate, and NULL is not zero.
    if (txRows.some((tx) =>
      tx.category?.group_id !== groupId || !tx.category?.slug ||
      tx.currency_mode !== mode ||
      !Number.isFinite(tx.amount_ars) || tx.amount_ars <= 0 ||
      (mode === "USD_ARS" && (tx.amount_usd == null || !Number.isFinite(tx.amount_usd))) ||
      (mode === "ARS_ARS" && (tx.amount_usd != null || tx.exchange_rate_snapshot != null)) ||
      (tx.exchange_rate_snapshot != null && (!Number.isFinite(tx.exchange_rate_snapshot) || tx.exchange_rate_snapshot <= 0))
    )) {
      return NextResponse.json({ error: "Hay movimientos con datos contables inconsistentes. No se generó el archivo." }, { status: 409 });
    }

    const exportTxs: ExportTransaction[] = txRows.map((tx) => ({
      date: tx.date,
      merchant: tx.merchant,
      categoryName: tx.category?.name ?? "Sin categoría",
      categoryEmoji: tx.category?.emoji ?? "📦",
      amount_ars: tx.amount_ars,
      description: tx.description,
      kind: isIncomeCategory(tx.category!.slug) ? "Ingreso" : "Gasto",
      accountingAmount: mode === "ARS_ARS" ? tx.amount_ars : tx.amount_usd!,
      accountingCurrency: mode === "ARS_ARS" ? "ARS" : "USD",
      exchangeRateSnapshot: tx.exchange_rate_snapshot,
    }));

    const allCats = await db.query.categories.findMany({
      where: and(eq(categories.is_active, 1), eq(categories.group_id, groupId)),
      orderBy: (c, { asc }) => asc(c.sort_order),
    });

    const budgetRows = await db.query.budgets.findMany({
      where: and(eq(budgets.group_id, groupId), eq(budgets.month, month)),
    });
    const budgetMap = Object.fromEntries(budgetRows.map((b) => [b.category_id, b]));

    const spentMap: Record<string, number> = {};
    for (const tx of txRows) {
      if (isIncomeCategory(tx.category?.slug)) continue;
      spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + tx.amount_ars;
    }

    const exportCats: ExportCategory[] = allCats.filter((cat) => !isIncomeCategory(cat.slug)).map((cat) => ({
      name: cat.name,
      emoji: cat.emoji,
      budget_ars: budgetMap[cat.id]?.budget_ars ?? 0,
      gastado_ars: spentMap[cat.id] ?? 0,
      hard_limit: budgetMap[cat.id]?.hard_limit ?? 1,
    }));

    const filename = `hermes-${month}`;

    if (format === "csv") {
      const csv = generateCSV(exportTxs);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
        },
      });
    }

    const buffer = await generateXLSX(exportTxs, exportCats);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("Error generating export:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
