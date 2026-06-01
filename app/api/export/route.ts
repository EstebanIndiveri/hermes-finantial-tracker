import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { transactions, budgets, categories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateCSV, generateXLSX } from "@/lib/export/generate";
import type { ExportTransaction, ExportCategory } from "@/lib/export/generate";

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const hdrs = await headers();
  const userId = hdrs.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month") ?? "";
  const format = searchParams.get("format") ?? "";

  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: "Parámetro month inválido. Usar formato YYYY-MM." }, { status: 400 });
  }
  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json({ error: "Parámetro format inválido. Usar csv o xlsx." }, { status: 400 });
  }

  try {
    const txRows = await db.query.transactions.findMany({
      where: and(
        eq(transactions.user_id, userId),
        eq(transactions.month, month),
        eq(transactions.status, "active"),
      ),
      orderBy: (t, { asc }) => asc(t.date),
      with: { category: true },
    });

    const exportTxs: ExportTransaction[] = txRows.map((tx) => ({
      date: tx.date,
      merchant: tx.merchant,
      categoryName: tx.category?.name ?? "Sin categoría",
      categoryEmoji: tx.category?.emoji ?? "📦",
      amount_ars: tx.amount_ars,
      description: tx.description,
    }));

    const allCats = await db.query.categories.findMany({
      where: eq(categories.is_active, 1),
      orderBy: (c, { asc }) => asc(c.sort_order),
    });

    const budgetRows = await db.query.budgets.findMany({
      where: and(eq(budgets.user_id, userId), eq(budgets.month, month)),
    });
    const budgetMap = Object.fromEntries(budgetRows.map((b) => [b.category_id, b]));

    const spentMap: Record<string, number> = {};
    for (const tx of txRows) {
      spentMap[tx.category_id] = (spentMap[tx.category_id] ?? 0) + tx.amount_ars;
    }

    const exportCats: ExportCategory[] = allCats.map((cat) => ({
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

    const buffer = generateXLSX(exportTxs, exportCats);
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
