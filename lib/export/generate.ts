import ExcelJS from "exceljs";
import { unzipSync, zipSync } from "fflate";

export interface ExportTransaction {
  date: string;
  merchant: string | null;
  categoryName: string;
  categoryEmoji: string;
  amount_ars: number;
  description: string | null;
  kind: "Ingreso" | "Gasto";
  accountingAmount: number;
  accountingCurrency: "USD" | "ARS";
  exchangeRateSnapshot: number | null;
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

function escapeXML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function categoryChartXml(cats: ExportCategory[]): string {
  const lastRow = cats.length + 1;
  const sheet = "'Resumen por categoría'";
  const categoryName = (index: number) => `${cats[index].emoji} ${cats[index].name}`;
  const stringCache = (values: string[]) =>
    `<c:strCache><c:ptCount val="${values.length}"/>${values.map((value, index) => `<c:pt idx="${index}"><c:v>${escapeXML(value)}</c:v></c:pt>`).join("")}</c:strCache>`;
  const numericCache = (values: Array<number | null>) =>
    `<c:numCache><c:formatCode>#,##0.00</c:formatCode><c:ptCount val="${values.length}"/>${values.map((value, index) => value === null ? "" : `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`).join("")}</c:numCache>`;
  const series = (
    index: number,
    titleColumn: "B" | "C",
    valueColumn: "B" | "C",
    title: string,
    values: Array<number | null>,
    color: string,
  ) => `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:strRef><c:f>${sheet}!$${titleColumn}$1</c:f>${stringCache([title])}</c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:cat><c:strRef><c:f>${sheet}!$A$2:$A$${lastRow}</c:f>${stringCache(cats.map((_, categoryIndex) => categoryName(categoryIndex)))}</c:strRef></c:cat><c:val><c:numRef><c:f>${sheet}!$${valueColumn}$2:$${valueColumn}$${lastRow}</c:f>${numericCache(values)}</c:numRef></c:val></c:ser>`;
  const budgetValues = cats.map((cat) => cat.budget_ars > 0 ? cat.budget_ars : null);
  const spendValues = cats.map((cat) => cat.gastado_ars);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:lang val="es-AR"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:rPr lang="es-AR"/><a:t>Presupuesto vs. gastado por categoría (ARS)</a:t></a:r><a:endParaRPr lang="es-AR"/></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series(0, "B", "B", "Presupuesto (ARS)", budgetValues, "2563EB")}${series(1, "C", "C", "Gastado (ARS)", spendValues, "F97316")}<c:gapWidth val="70"/><c:overlap val="0"/><c:axId val="10"/><c:axId val="20"/></c:barChart><c:catAx><c:axId val="10"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:delete val="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="es-AR"/></a:p></c:txPr><c:crossAx val="20"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="20"/><c:scaling><c:orientation val="minMax"/><c:minorUnit val="1"/></c:scaling><c:axPos val="b"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9E2F3"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="es-AR"/></a:p></c:txPr><c:crossAx val="10"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="es-AR"/></a:p></c:txPr></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart><c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>`;
}

function withCategoryChart(buffer: Buffer, cats: ExportCategory[]): Buffer {
  if (cats.length === 0) return buffer;

  const files = unzipSync(buffer);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const read = (path: string): string => {
    const contents = files[path];
    if (!contents) throw new Error(`Cannot attach category chart: missing XLSX part ${path}`);
    return decoder.decode(contents);
  };
  const write = (path: string, contents: string) => {
    files[path] = encoder.encode(contents);
  };
  const contentTypes = read("[Content_Types].xml");
  const summarySheet = read("xl/worksheets/sheet2.xml");

  if (
    !contentTypes.includes("</Types>") ||
    !summarySheet.includes("</worksheet>") ||
    files["xl/worksheets/_rels/sheet2.xml.rels"] !== undefined ||
    summarySheet.includes("<drawing")
  ) {
    throw new Error("Cannot attach category chart: invalid XLSX package structure");
  }

  write(
    "[Content_Types].xml",
    contentTypes.replace(
      "</Types>",
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>',
    ),
  );
  write(
    "xl/worksheets/sheet2.xml",
    summarySheet.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>'),
  );
  write(
    "xl/worksheets/_rels/sheet2.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
  );
  write(
    "xl/drawings/drawing1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${cats.length + 2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${cats.length + 18}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Presupuesto vs. gastado por categoría"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`,
  );
  write(
    "xl/drawings/_rels/drawing1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>',
  );
  write("xl/charts/chart1.xml", categoryChartXml(cats));

  return Buffer.from(zipSync(files, { level: 6 }));
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
  const header = "Fecha,Comercio,Categoría,Monto (ARS),Descripción,Tipo,Monto contable,Moneda contable,Cotización registrada (ARS/USD)";
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
      tx.kind,
      tx.accountingAmount.toString(),
      tx.accountingCurrency,
      tx.exchangeRateSnapshot?.toString() ?? "",
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
    ["Fecha", "Comercio", "Categoría", "Monto (ARS)", "Descripción", "Tipo", "Monto contable", "Moneda contable", "Cotización registrada (ARS/USD)"],
    ...txs.map((tx) => [
      formatDate(tx.date),
      tx.merchant ?? "",
      `${tx.categoryEmoji} ${tx.categoryName}`,
      tx.amount_ars,
      tx.description ?? "",
      tx.kind,
      tx.accountingAmount,
      tx.accountingCurrency,
      tx.exchangeRateSnapshot,
    ]),
  ];
  const transactionsSheet = workbook.addWorksheet("Movimientos");
  transactionsSheet.addRows(transactionRows);
  styleExportSheet(transactionsSheet, [16, 26, 29, 19, 52, 15, 20, 18, 30], [4, 7, 9]);

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
    // ExcelJS's runtime serializer supports this required OOXML color, although
    // its DataBarRuleType declaration omits the property.
    const dataBarRule: ExcelJS.DataBarRuleType & { color: { argb: string } } = {
      type: "dataBar",
      priority: 1,
      showValue: true,
      gradient: false,
      cfvo: [{ type: "num", value: 0 }, { type: "max" }],
      color: { argb: "FF93C5FD" },
    };
    summarySheet.addConditionalFormatting({
      ref: `C2:C${cats.length + 1}`,
      rules: [dataBarRule],
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

  return workbook.xlsx.writeBuffer().then((buffer) => withCategoryChart(Buffer.from(buffer), cats));
}
