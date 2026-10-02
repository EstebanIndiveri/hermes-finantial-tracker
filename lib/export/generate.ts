import ExcelJS from "exceljs";

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

function styleExportSheet(
  sheet: ExcelJS.Worksheet,
  widths: number[],
  monetaryColumns: number[],
): void {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + widths.length)}${sheet.rowCount}` };
  sheet.pageSetup.orientation = "landscape";
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;

  widths.forEach((width, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = width;
    column.alignment = { vertical: "top", wrapText: true };
  });

  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17324D" } };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    row.font = { name: "Arial", size: 10, color: { argb: "FF1E293B" } };
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7FB" } };
    }
    const neededLines = Math.max(1, ...widths.map((width, index) => {
      const value = row.getCell(index + 1).value;
      if (typeof value !== "string") return 1;
      const charsPerLine = Math.max(8, Math.floor(width * 0.85));
      return value.split(/\r?\n/).reduce(
        (lines, part) => lines + Math.max(1, Math.ceil(part.length / charsPerLine)),
        0,
      );
    }));
    row.height = Math.min(405, Math.max(22, neededLines * 16 + 6));
  }

  for (const columnNumber of monetaryColumns) {
    sheet.getColumn(columnNumber).numFmt = '#,##0.00;[Red](#,##0.00);"-"';
    sheet.getColumn(columnNumber).alignment = { vertical: "top", horizontal: "right", wrapText: true };
  }
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

  return `\uFEFF${[header, ...rows].join("\n")}`;
}

export function generateXLSX(
  txs: ExportTransaction[],
  cats: ExportCategory[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

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
  const transactionsSheet = workbook.addWorksheet("Movimientos");
  transactionsSheet.addRows(transactionRows);
  styleExportSheet(transactionsSheet, [16, 26, 29, 19, 52], [4]);

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
  const summarySheet = workbook.addWorksheet("Resumen por categoría");
  summarySheet.addRows(summaryRows);
  styleExportSheet(summarySheet, [32, 23, 20, 20, 15], [2, 3, 4]);
  if (cats.length > 0) {
    summarySheet.addConditionalFormatting({
      ref: `C2:C${cats.length + 1}`,
      rules: [{
        type: "dataBar",
        priority: 1,
        showValue: true,
        gradient: false,
        cfvo: [{ type: "num", value: 0 }, { type: "max" }],
      }],
    });
  }

  const budgetRows = [
    ["Categoría", "Límite mensual (ARS)", "Estado"],
    ...cats.map((cat) => [
      `${cat.emoji} ${cat.name}`,
      cat.budget_ars > 0 ? cat.budget_ars : "Sin límite",
      cat.hard_limit === 1 ? "activo" : "cerrado",
    ]),
  ];
  const budgetSheet = workbook.addWorksheet("Presupuestos");
  budgetSheet.addRows(budgetRows);
  styleExportSheet(budgetSheet, [32, 25, 17], [2]);

  return workbook.xlsx.writeBuffer().then((buffer) => Buffer.from(buffer));
}
