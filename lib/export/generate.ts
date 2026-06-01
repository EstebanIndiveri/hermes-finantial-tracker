import * as XLSX from "xlsx";

export interface ExportTransaction {
  date: string;
  merchant: string | null;
  categoryName: string;
  categoryEmoji: string;
  amount_ars: number;
  description: string | null;
}

export interface ExportCategory {
  name: string;
  emoji: string;
  budget_ars: number;
  gastado_ars: number;
  hard_limit: number;
}

function formatDate(iso: string): string {
  const [datePart] = iso.split("T");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);

  if (!match) {
    throw new Error(`Invalid date format: ${iso}`);
  }

  const [, year, month, day] = match;
  const parsedDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCFullYear().toString().padStart(4, "0") !== year ||
    (parsedDate.getUTCMonth() + 1).toString().padStart(2, "0") !== month ||
    parsedDate.getUTCDate().toString().padStart(2, "0") !== day
  ) {
    throw new Error(`Invalid date format: ${iso}`);
  }

  return `${day}/${month}/${year}`;
}

function escapeCSVValue(value: string): string {
  const sanitizedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  const escapedValue = sanitizedValue.replace(/"/g, '""');

  return /[",\n\r]/.test(escapedValue) ? `"${escapedValue}"` : escapedValue;
}

export function generateCSV(txs: ExportTransaction[]): string {
  const header = "Fecha,Comercio,Categoría,Monto (ARS),Descripción";
  const rows = txs.map((tx) => {
    const date = formatDate(tx.date);
    const merchant = tx.merchant ?? "";
    const category = `${tx.categoryEmoji} ${tx.categoryName}`;
    const amount = tx.amount_ars.toString();
    const description = tx.description ?? "";

    return [
      date,
      escapeCSVValue(merchant),
      escapeCSVValue(category),
      amount,
      escapeCSVValue(description),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

export function generateXLSX(
  txs: ExportTransaction[],
  cats: ExportCategory[],
): Buffer {
  const workbook = XLSX.utils.book_new();

  const transactionRows = [
    ["Fecha", "Comercio", "Categoría", "Monto (ARS)", "Descripción"],
    ...txs.map((tx) => [
      formatDate(tx.date),
      tx.merchant ?? "",
      `${tx.categoryEmoji} ${tx.categoryName}`,
      tx.amount_ars,
      tx.description ?? "",
    ]),
  ];
  const transactionsSheet = XLSX.utils.aoa_to_sheet(transactionRows);
  XLSX.utils.book_append_sheet(workbook, transactionsSheet, "Movimientos");

  const summaryRows = [
    ["Categoría", "Presupuesto (ARS)", "Gastado (ARS)", "Saldo (ARS)", "% Usado"],
    ...cats.map((cat) => {
      const saldo = cat.budget_ars > 0 ? cat.budget_ars - cat.gastado_ars : null;
      const pct = cat.budget_ars > 0 ? Math.round((cat.gastado_ars / cat.budget_ars) * 100) : null;

      return [
        `${cat.emoji} ${cat.name}`,
        cat.budget_ars > 0 ? cat.budget_ars : "Sin límite",
        cat.gastado_ars,
        saldo !== null ? saldo : "—",
        pct !== null ? `${pct}%` : "—",
      ];
    }),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen por categoría");

  const budgetRows = [
    ["Categoría", "Límite mensual (ARS)", "Estado"],
    ...cats.map((cat) => [
      `${cat.emoji} ${cat.name}`,
      cat.budget_ars > 0 ? cat.budget_ars : "Sin límite",
      cat.hard_limit === 1 ? "activo" : "cerrado",
    ]),
  ];
  const budgetSheet = XLSX.utils.aoa_to_sheet(budgetRows);
  XLSX.utils.book_append_sheet(workbook, budgetSheet, "Presupuestos");

  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
