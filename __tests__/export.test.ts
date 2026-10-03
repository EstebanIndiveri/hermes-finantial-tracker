import ExcelJS from "exceljs";
import { inflateRawSync } from "node:zlib";
import { generateCSV, generateXLSX } from "@/lib/export/generate";
import type { ExportTransaction, ExportCategory } from "@/lib/export/generate";

const sampleTxs: ExportTransaction[] = [
  {
    date: "2026-05-10",
    merchant: "Disco",
    categoryName: "Supermercado",
    categoryEmoji: "🛒",
    amount_ars: 15000,
    kind: "Gasto",
    accountingAmount: 12.5,
    accountingCurrency: "USD",
    exchangeRateSnapshot: 1200,
    description: "compras semana",
  },
  {
    date: "2026-05-15",
    merchant: null,
    categoryName: "Salidas",
    categoryEmoji: "🍽️",
    amount_ars: 8500,
    kind: "Gasto",
    accountingAmount: 7.08,
    accountingCurrency: "USD",
    exchangeRateSnapshot: null,
    description: null,
  },
];

const sampleCats: ExportCategory[] = [
  { name: "Supermercado", emoji: "🛒", budget_ars: 50000, gastado_ars: 15000, hard_limit: 1 },
  { name: "Salidas", emoji: "🍽️", budget_ars: 0, gastado_ars: 8500, hard_limit: 1 },
];

async function readWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function readRows(workbook: ExcelJS.Workbook, worksheetName: string): unknown[][] {
  return workbook
    .getWorksheet(worksheetName)!
    .getSheetValues()
    .slice(1)
    .map((row) => (Array.isArray(row) ? row.slice(1) : []));
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function unzipEntry(buffer: Buffer, entryName: string): string {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;

  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) throw new Error("Invalid ZIP archive: end-of-directory record not found");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error("Invalid ZIP archive: malformed central directory");
    }

    const compression = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const nameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer.toString("utf8", centralOffset + 46, centralOffset + 46 + nameLength);

    if (name === entryName) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error(`Invalid ZIP archive: malformed local header for ${entryName}`);
      }

      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);

      if (compression === 0) return compressed.toString("utf8");
      if (compression === 8) return inflateRawSync(compressed).toString("utf8");
      throw new Error(`Unsupported ZIP compression method ${compression} for ${entryName}`);
    }

    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}

function xmlText(value: string): string {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(tag: string, attribute: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${attribute}="([^"]*)"`).exec(tag);
  return match ? xmlText(match[1]) : undefined;
}

function cellXml(sheetXml: string, address: string): string {
  const cell = sheetXml.match(new RegExp(`<c\\b(?=[^>]*\\br="${address}")[^>]*>[\\s\\S]*?<\\/c>|<c\\b(?=[^>]*\\br="${address}")[^>]*/>`));
  if (!cell) throw new Error(`Cell ${address} not found in worksheet XML`);
  return cell[0];
}

function cellStringValue(cell: string, sharedStrings: string): string {
  const type = xmlAttribute(cell.slice(0, cell.indexOf(">") + 1), "t");
  if (type === "inlineStr") {
    return [...cell.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((match) => xmlText(match[1]))
      .join("");
  }

  const value = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1];
  if (type === "s" && value !== undefined) {
    const index = Number(value);
    const entries = [...sharedStrings.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)];
    const entry = entries[index]?.[1];
    if (entry === undefined) throw new Error(`Shared string index ${index} not found`);
    return [...entry.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((match) => xmlText(match[1]))
      .join("");
  }

  if (value === undefined) throw new Error("Cell has no serialized value");
  return xmlText(value);
}

function rawWorksheetXml(buffer: Buffer, expectedName: string): string {
  const workbookXml = unzipEntry(buffer, "xl/workbook.xml");
  const relationshipsXml = unzipEntry(buffer, "xl/_rels/workbook.xml.rels");
  const sheetTags = [...workbookXml.matchAll(/<sheet\b[^>]*\/?\s*>/g)].map((match) => match[0]);
  const sheet = sheetTags.find((tag) => xmlAttribute(tag, "name") === expectedName);
  if (!sheet) throw new Error(`Worksheet not found in workbook.xml: ${expectedName}`);

  const relationshipId = xmlAttribute(sheet, "r:id");
  if (!relationshipId) throw new Error(`Worksheet ${expectedName} has no relationship ID`);

  const relationship = [...relationshipsXml.matchAll(/<Relationship\b[^>]*\/?\s*>/g)]
    .map((match) => match[0])
    .find((tag) => xmlAttribute(tag, "Id") === relationshipId);
  const target = relationship && xmlAttribute(relationship, "Target");
  if (!target) throw new Error(`Worksheet relationship target not found: ${expectedName}`);

  const entryName = target.startsWith("/")
    ? target.slice(1)
    : target.startsWith("xl/")
      ? target
      : `xl/${target}`;
  return unzipEntry(buffer, entryName);
}

describe("generateCSV", () => {
  it("exports type, accounting units and only the recorded FX snapshot", () => {
    const csv = stripBom(generateCSV(sampleTxs));
    expect(csv.split("\n")[0]).toBe("Fecha,Comercio,Categoría,Monto (ARS),Descripción,Tipo,Monto contable,Moneda contable,Cotización registrada (ARS/USD)");
    expect(csv.split("\n")[1]).toBe("10/05/2026,Disco,🛒 Supermercado,15000,compras semana,Gasto,12.5,USD,1200");
    expect(csv.split("\n")[2]).toBe("15/05/2026,,🍽️ Salidas,8500,,Gasto,7.08,USD,");
  });

  it("keeps ARS-only accounting in ARS without a fabricated USD value", () => {
    const csv = generateCSV([{ ...sampleTxs[0], kind: "Ingreso", accountingAmount: 2000, accountingCurrency: "ARS", amount_ars: 2000, exchangeRateSnapshot: null }]);
    expect(csv).toContain(",Ingreso,2000,ARS,");
    expect(csv).not.toContain("USD,1");
  });
  it("includes the correct header row", () => {
    const csv = generateCSV(sampleTxs);
    const firstLine = stripBom(csv).split("\n")[0];
    expect(firstLine).toBe("Fecha,Comercio,Categoría,Monto (ARS),Descripción,Tipo,Monto contable,Moneda contable,Cotización registrada (ARS/USD)");
  });

  it("generates one data row per transaction", () => {
    const csv = generateCSV(sampleTxs);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it("formats date as DD/MM/YYYY", () => {
    const csv = generateCSV(sampleTxs);
    expect(csv).toContain("10/05/2026");
  });

  it("formats ISO timestamps using only the date portion", () => {
    const csv = generateCSV([
      {
        ...sampleTxs[0],
        date: "2026-05-10T12:00:00Z",
      },
    ]);

    expect(csv).toContain("10/05/2026");
  });

  it("throws for malformed dates instead of generating corrupted CSV", () => {
    expect(() =>
      generateCSV([
        {
          ...sampleTxs[0],
          date: "2026-05",
        },
      ]),
    ).toThrow("Invalid date format");
  });

  it("throws for semantically invalid dates", () => {
    expect(() =>
      generateCSV([
        {
          ...sampleTxs[0],
          date: "2026-13-10",
        },
      ]),
    ).toThrow("Invalid date format");

    expect(() =>
      generateCSV([
        {
          ...sampleTxs[0],
          date: "2026-05-32",
        },
      ]),
    ).toThrow("Invalid date format");
  });

  it("formats amount with dot as decimal separator", () => {
    const csv = generateCSV(sampleTxs);
    expect(csv).toContain("15000");
  });

  it("uses empty string for null merchant", () => {
    const csv = generateCSV(sampleTxs);
    const secondRow = csv.split("\n")[2];
    expect(secondRow).toContain(",,"); // merchant vacío produce doble coma
  });

  it("returns empty CSV with only header when no transactions", () => {
    const csv = generateCSV([]);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it("prepends a UTF-8 BOM for Excel compatibility", () => {
    const csv = generateCSV(sampleTxs);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("escapes embedded quotes inside CSV values", () => {
    const csv = generateCSV([
      {
        ...sampleTxs[0],
        merchant: 'Café "El Centro", Downtown',
      },
    ]);

    expect(csv).toContain('"Café ""El Centro"", Downtown"');
  });

  it("quotes values containing newlines without creating extra rows", () => {
    const csv = generateCSV([
      {
        ...sampleTxs[0],
        description: "compras\nsemana",
      },
    ]);

    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(csv).toContain('"compras\nsemana"');
  });

  it("neutralizes formula-like CSV values", () => {
    const csv = generateCSV([
      {
        ...sampleTxs[0],
        merchant: "=SUM(A1:A10)",
      },
    ]);

    expect(csv).toContain("'=");
  });
});

describe("generateXLSX", () => {
  it("keeps accounting amounts numeric and distinguishes an ARS income", async () => {
    const transactions = (await readWorkbook(await generateXLSX([
      { ...sampleTxs[0], kind: "Ingreso", amount_ars: 2000, accountingAmount: 2000, accountingCurrency: "ARS", exchangeRateSnapshot: null },
    ], sampleCats))).getWorksheet("Movimientos")!;
    expect(transactions.getRow(1).values.slice(1)).toEqual([
      "Fecha", "Comercio", "Categoría", "Monto (ARS)", "Descripción", "Tipo", "Monto contable", "Moneda contable", "Cotización registrada (ARS/USD)",
    ]);
    expect(transactions.getCell("F2").value).toBe("Ingreso");
    expect(transactions.getCell("G2").value).toBe(2000);
    expect(transactions.getCell("G2").type).toBe(ExcelJS.ValueType.Number);
    expect(transactions.getCell("H2").value).toBe("ARS");
    expect(transactions.getCell("I2").value).toBeNull();
  });
  it("returns a Buffer", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it("starts with xlsx magic bytes (PK zip header)", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    // xlsx files are ZIP archives — start with PK (0x50, 0x4B)
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("returns a non-empty buffer", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("generates exactly 3 sheets", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    const wb = await readWorkbook(buf);
    expect(wb.worksheets).toHaveLength(3);
  });

  it("has correct sheet names", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    const wb = await readWorkbook(buf);
    expect(wb.worksheets.map((sheet) => sheet.name)).toEqual(["Movimientos", "Resumen por categoría", "Presupuestos"]);
  });

  it("Movimientos sheet has correct header", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    const sheet = (await readWorkbook(buf)).getWorksheet("Movimientos")!;
    expect(sheet.getRow(1).values.slice(1)).toEqual(["Fecha", "Comercio", "Categoría", "Monto (ARS)", "Descripción", "Tipo", "Monto contable", "Moneda contable", "Cotización registrada (ARS/USD)"]);
  });

  it("Resumen por categoría sheet has correct header", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    const sheet = (await readWorkbook(buf)).getWorksheet("Resumen por categoría")!;
    expect(sheet.getRow(1).values.slice(1)).toEqual(["Categoría", "Presupuesto (ARS)", "Gastado (ARS)", "Saldo (ARS)", "% Usado"]);
  });

  it("Presupuestos sheet has correct header", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    const sheet = (await readWorkbook(buf)).getWorksheet("Presupuestos")!;
    expect(sheet.getRow(1).values.slice(1)).toEqual(["Categoría", "Límite mensual (ARS)", "Estado"]);
  });

  it("Movimientos sheet has data rows matching input", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    const rows = readRows(await readWorkbook(buf), "Movimientos");
    expect(rows).toHaveLength(sampleTxs.length + 1);
    expect(rows[1]).toEqual(["10/05/2026", "Disco", "🛒 Supermercado", 15000, "compras semana", "Gasto", 12.5, "USD", 1200]);
    expect(rows[2].slice(0, 8)).toEqual(["15/05/2026", "", "🍽️ Salidas", 8500, "", "Gasto", 7.08, "USD"]);
  });

  it("Resumen por categoría sheet has data rows matching input", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    const rows = readRows(await readWorkbook(buf), "Resumen por categoría");
    expect(rows).toHaveLength(sampleCats.length + 1);
    expect(rows[1]).toEqual(["🛒 Supermercado", 50000, 15000, 35000, "30%"]);
    expect(rows[2]).toEqual(["🍽️ Salidas", "Sin límite", 8500, "—", "—"]);
  });

  it("Presupuestos sheet has data rows matching input", async () => {
    const buf = await generateXLSX(sampleTxs, sampleCats);
    const rows = readRows(await readWorkbook(buf), "Presupuestos");
    expect(rows).toHaveLength(sampleCats.length + 1);
    expect(rows[1]).toEqual(["🛒 Supermercado", 50000, "activo"]);
    expect(rows[2]).toEqual(["🍽️ Salidas", "Sin límite", "activo"]);
  });

  it("generates workbook with empty inputs and keeps headers", async () => {
    const buf = await generateXLSX([], []);
    const wb = await readWorkbook(buf);

    expect(wb.worksheets.map((sheet) => sheet.name)).toEqual(["Movimientos", "Resumen por categoría", "Presupuestos"]);
    expect(wb.getWorksheet("Movimientos")!.getCell("A1").value).toBe("Fecha");
    expect(wb.getWorksheet("Resumen por categoría")!.getCell("A1").value).toBe("Categoría");
    expect(wb.getWorksheet("Presupuestos")!.getCell("A1").value).toBe("Categoría");
  });

  it("keeps formula-like user text literal", async () => {
    const buf = await generateXLSX([{ ...sampleTxs[0], merchant: "=1+1" }], sampleCats);
    const cell = (await readWorkbook(buf)).getWorksheet("Movimientos")!.getCell("B2");
    expect(cell.value).toBe("=1+1");
    expect(cell.type).toBe(ExcelJS.ValueType.String);
  });

  it("preserves numeric and textual cell types", async () => {
    const workbook = await readWorkbook(await generateXLSX(sampleTxs, sampleCats));
    const transactions = workbook.getWorksheet("Movimientos")!;
    const summary = workbook.getWorksheet("Resumen por categoría")!;

    expect(transactions.getCell("D2").type).toBe(ExcelJS.ValueType.Number);
    expect(transactions.getCell("A2").type).toBe(ExcelJS.ValueType.String);
    expect(summary.getCell("B2").type).toBe(ExcelJS.ValueType.Number);
    expect(summary.getCell("E2").type).toBe(ExcelJS.ValueType.String);
  });

  it("keeps headers visible and exposes usable filters and column widths on every sheet", async () => {
    const workbook = await readWorkbook(await generateXLSX(sampleTxs, sampleCats));
    const expectedLastColumns = ["I", "E", "C"];

    workbook.worksheets.forEach((sheet, index) => {
      expect(sheet.views).toEqual(expect.arrayContaining([expect.objectContaining({ state: "frozen", ySplit: 1 })]));
      expect(sheet.autoFilter).toBe(`A1:${expectedLastColumns[index]}${sheet.rowCount}`);
      expect(sheet.getRow(1).font.bold).toBe(true);
      expect(sheet.getRow(1).height).toBeGreaterThanOrEqual(24);
      expect(sheet.getColumn(1).width).toBeGreaterThanOrEqual(16);
    });

    const transactions = workbook.getWorksheet("Movimientos")!;
    expect(transactions.getColumn(2).width).toBeGreaterThanOrEqual(24);
    expect(transactions.getColumn(3).width).toBeGreaterThanOrEqual(24);
    expect(transactions.getColumn(5).width).toBeGreaterThanOrEqual(35);
    expect(transactions.getCell("E2").alignment.wrapText).toBe(true);
    expect(transactions.getCell("D2").numFmt).toContain("#,##0");
  });

  it("adds native category-spend data bars without altering numeric amounts", async () => {
    const buffer = await generateXLSX(sampleTxs, sampleCats);
    const summary = (await readWorkbook(buffer)).getWorksheet("Resumen por categoría")!;

    expect(summary.getCell("C2").value).toBe(15000);
    expect(summary.getCell("C3").value).toBe(8500);
    const summaryXml = rawWorksheetXml(buffer, "Resumen por categoría");
    expect(summaryXml).toContain('sqref="C2:C3"');
    expect(summaryXml).toContain('<dataBar');
    expect(summaryXml).toContain('rgb="FF93C5FD"');
  });

  it("adds an editable budget-versus-spend category chart using summary cells", async () => {
    const buffer = await generateXLSX(sampleTxs, sampleCats);
    const contentTypes = unzipEntry(buffer, "[Content_Types].xml");
    const summaryXml = rawWorksheetXml(buffer, "Resumen por categoría");
    const summaryRels = unzipEntry(buffer, "xl/worksheets/_rels/sheet2.xml.rels");
    const drawing = unzipEntry(buffer, "xl/drawings/drawing1.xml");
    const drawingRels = unzipEntry(buffer, "xl/drawings/_rels/drawing1.xml.rels");
    const chart = unzipEntry(buffer, "xl/charts/chart1.xml");

    expect(contentTypes).toContain("/xl/drawings/drawing1.xml");
    expect(contentTypes).toContain("/xl/charts/chart1.xml");
    expect(summaryXml).toMatch(/<drawing\b[^>]*r:id="rId\d+"/);
    expect(summaryRels).toContain("../drawings/drawing1.xml");
    expect(drawing).toContain("<xdr:twoCellAnchor");
    expect(drawingRels).toContain("../charts/chart1.xml");
    expect(chart).toContain("<c:barDir val=\"bar\"/>");
    expect(chart).toContain("'Resumen por categoría'!$A$2:$A$3");
    expect(chart).toContain("'Resumen por categoría'!$B$2:$B$3");
    expect(chart).toContain("'Resumen por categoría'!$C$2:$C$3");
    expect(chart).toContain("Presupuesto");
    expect(chart).toContain("Gastado");
  });

  it("keeps the empty export readable without adding a non-existent chart", async () => {
    const buffer = await generateXLSX([], []);
    const workbook = await readWorkbook(buffer);
    const movements = workbook.getWorksheet("Movimientos")!;
    expect(movements.autoFilter).toBe("A1:I1");
    expect(movements.getColumn(5).width).toBeGreaterThanOrEqual(35);
    expect(movements.rowCount).toBe(1);
    expect(() => unzipEntry(buffer, "xl/charts/chart1.xml")).toThrow("ZIP entry not found");
  });

  it("expands a normal long or multiline description instead of clipping it", async () => {
    const workbook = await readWorkbook(await generateXLSX(
      [{ ...sampleTxs[0], description: `Compra semanal\n${"Detalle del ticket ".repeat(7)}` }],
      sampleCats,
    ));
    const movements = workbook.getWorksheet("Movimientos")!;

    expect(movements.getRow(2).height).toBeGreaterThan(38);
    expect(movements.getCell("E2").alignment.wrapText).toBe(true);
  });

  it("serializes workbook structure and cell types in OOXML, keeping formula-like merchants literal", async () => {
    const buffer = await generateXLSX(
      [{ ...sampleTxs[0], merchant: "=1+1" }],
      sampleCats,
    );
    const workbookXml = unzipEntry(buffer, "xl/workbook.xml");
    const sheetNames = [...workbookXml.matchAll(/<sheet\b[^>]*\/?\s*>/g)]
      .map((match) => xmlAttribute(match[0], "name"));

    expect(sheetNames).toEqual(["Movimientos", "Resumen por categoría", "Presupuestos"]);

    const transactionsXml = rawWorksheetXml(buffer, "Movimientos");
    const summaryXml = rawWorksheetXml(buffer, "Resumen por categoría");
    const sharedStrings = unzipEntry(buffer, "xl/sharedStrings.xml");
    const dateCell = cellXml(transactionsXml, "A2");
    const merchantCell = cellXml(transactionsXml, "B2");
    const amountCell = cellXml(transactionsXml, "D2");
    const budgetCell = cellXml(summaryXml, "B2");

    expect(cellStringValue(dateCell, sharedStrings)).toBe("10/05/2026");
    expect(cellStringValue(merchantCell, sharedStrings)).toBe("=1+1");
    expect(merchantCell).not.toMatch(/<f(?:\s[^>]*)?>/);
    expect(amountCell).toContain("<v>15000</v>");
    expect(xmlAttribute(amountCell.slice(0, amountCell.indexOf(">") + 1), "t")).not.toBe("s");
    expect(budgetCell).toContain("<v>50000</v>");
    expect(xmlAttribute(budgetCell.slice(0, budgetCell.indexOf(">") + 1), "t")).not.toBe("s");
  });
});
