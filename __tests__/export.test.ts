import * as XLSX from "xlsx";
import { generateCSV, generateXLSX } from "@/lib/export/generate";
import type { ExportTransaction, ExportCategory } from "@/lib/export/generate";

const sampleTxs: ExportTransaction[] = [
  {
    date: "2026-05-10",
    merchant: "Disco",
    categoryName: "Supermercado",
    categoryEmoji: "🛒",
    amount_ars: 15000,
    description: "compras semana",
  },
  {
    date: "2026-05-15",
    merchant: null,
    categoryName: "Salidas",
    categoryEmoji: "🍽️",
    amount_ars: 8500,
    description: null,
  },
];

const sampleCats: ExportCategory[] = [
  { name: "Supermercado", emoji: "🛒", budget_ars: 50000, gastado_ars: 15000, hard_limit: 1 },
  { name: "Salidas", emoji: "🍽️", budget_ars: 0, gastado_ars: 8500, hard_limit: 1 },
];

describe("generateCSV", () => {
  it("includes the correct header row", () => {
    const csv = generateCSV(sampleTxs);
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe("Fecha,Comercio,Categoría,Monto (ARS),Descripción");
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
  it("returns a Buffer", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it("starts with xlsx magic bytes (PK zip header)", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    // xlsx files are ZIP archives — start with PK (0x50, 0x4B)
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("returns a non-empty buffer", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("generates exactly 3 sheets", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toHaveLength(3);
  });

  it("has correct sheet names", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Movimientos", "Resumen por categoría", "Presupuestos"]);
  });

  it("Movimientos sheet has correct header", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets["Movimientos"];
    expect(sheet["A1"]?.v).toBe("Fecha");
    expect(sheet["B1"]?.v).toBe("Comercio");
    expect(sheet["C1"]?.v).toBe("Categoría");
    expect(sheet["D1"]?.v).toBe("Monto (ARS)");
    expect(sheet["E1"]?.v).toBe("Descripción");
  });

  it("Resumen por categoría sheet has correct header", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets["Resumen por categoría"];
    expect(sheet["A1"]?.v).toBe("Categoría");
    expect(sheet["B1"]?.v).toBe("Presupuesto (ARS)");
    expect(sheet["C1"]?.v).toBe("Gastado (ARS)");
    expect(sheet["D1"]?.v).toBe("Saldo (ARS)");
    expect(sheet["E1"]?.v).toBe("% Usado");
  });

  it("Presupuestos sheet has correct header", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets["Presupuestos"];
    expect(sheet["A1"]?.v).toBe("Categoría");
    expect(sheet["B1"]?.v).toBe("Límite mensual (ARS)");
    expect(sheet["C1"]?.v).toBe("Estado");
  });

  it("Movimientos sheet has data rows matching input", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    const wb = XLSX.read(buf, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Movimientos"], { header: 1 }) as unknown[][];
    expect(rows).toHaveLength(sampleTxs.length + 1);
    expect(rows[1]).toEqual(["10/05/2026", "Disco", "🛒 Supermercado", 15000, "compras semana"]);
    expect(rows[2]).toEqual(["15/05/2026", "", "🍽️ Salidas", 8500, ""]);
  });

  it("Resumen por categoría sheet has data rows matching input", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    const wb = XLSX.read(buf, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Resumen por categoría"], { header: 1 }) as unknown[][];
    expect(rows).toHaveLength(sampleCats.length + 1);
    expect(rows[1]).toEqual(["🛒 Supermercado", 50000, 15000, 35000, "30%"]);
    expect(rows[2]).toEqual(["🍽️ Salidas", "Sin límite", 8500, "—", "—"]);
  });

  it("Presupuestos sheet has data rows matching input", () => {
    const buf = generateXLSX(sampleTxs, sampleCats);
    const wb = XLSX.read(buf, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["Presupuestos"], { header: 1 }) as unknown[][];
    expect(rows).toHaveLength(sampleCats.length + 1);
    expect(rows[1]).toEqual(["🛒 Supermercado", 50000, "activo"]);
    expect(rows[2]).toEqual(["🍽️ Salidas", "Sin límite", "activo"]);
  });

  it("generates workbook with empty inputs and keeps headers", () => {
    const buf = generateXLSX([], []);
    const wb = XLSX.read(buf, { type: "buffer" });

    expect(wb.SheetNames).toEqual(["Movimientos", "Resumen por categoría", "Presupuestos"]);
    expect(wb.Sheets["Movimientos"]["A1"]?.v).toBe("Fecha");
    expect(wb.Sheets["Resumen por categoría"]["A1"]?.v).toBe("Categoría");
    expect(wb.Sheets["Presupuestos"]["A1"]?.v).toBe("Categoría");
  });
});
