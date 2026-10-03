import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { GET } from "../route";
import { db } from "@/lib/db/client";
import { generateCSV, generateXLSX } from "@/lib/export/generate";

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      transactions: {
        findMany: jest.fn(),
      },
      categories: {
        findMany: jest.fn(),
      },
      budgets: {
        findMany: jest.fn(),
      },
      monthly_settings: {
        findFirst: jest.fn(),
      },
    },
  },
}));

jest.mock("@/lib/export/generate", () => ({
  generateCSV: jest.fn(() => "csv-content"),
  generateXLSX: jest.fn(() => Buffer.from("xlsx-content")),
}));

jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
}));

describe("GET /api/export", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (headers as jest.Mock).mockResolvedValue({
      get: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const { getGroupMembership } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "group-123", user_id: "user-123", role: "member" });

    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.categories.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.budgets.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "USD_ARS" });
  });

  test("rejects an ARS-only month while the feature flag is off", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS" });
    const response = await GET(new NextRequest("http://localhost:3000/api/export?month=2026-10&format=csv"));
    expect(response.status).toBe(409);
    expect(generateCSV).not.toHaveBeenCalled();
  });

  test("does not export an unconfigured month", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);
    const response = await GET(new NextRequest("http://localhost:3000/api/export?month=2026-10&format=csv"));
    expect(response.status).toBe(409);
    expect(db.query.transactions.findMany).not.toHaveBeenCalled();
  });

  test("rejects a movement whose category belongs to another group", async () => {
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([{ date: "2026-10-02", category_id: "foreign", category: { group_id: "other-group", slug: "supermercado", name: "Supermercado", emoji: "🛒" }, amount_ars: 100, amount_usd: 0.08, currency_mode: "USD_ARS", exchange_rate_snapshot: null }]);
    const response = await GET(new NextRequest("http://localhost:3000/api/export?month=2026-10&format=xlsx"));
    expect(response.status).toBe(409);
    expect(generateXLSX).not.toHaveBeenCalled();
  });

  test("exports ARS-only income without manufacturing USD or exchange rate", async () => {
    const previous = process.env.ACT05_ARS_MODE_ENABLED;
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    try {
      (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS" });
      (db.query.transactions.findMany as jest.Mock).mockResolvedValue([{ date: "2026-10-02", merchant: "Sueldo", category_id: "income", category: { group_id: "group-123", slug: "ingresos", name: "Ingresos", emoji: "💵" }, amount_ars: 2000, amount_usd: null, currency_mode: "ARS_ARS", exchange_rate_snapshot: null, description: null }]);
      const response = await GET(new NextRequest("http://localhost:3000/api/export?month=2026-10&format=csv"));
      expect(response.status).toBe(200);
      expect(generateCSV).toHaveBeenCalledWith([expect.objectContaining({ kind: "Ingreso", accountingAmount: 2000, accountingCurrency: "ARS", exchangeRateSnapshot: null })]);
    } finally {
      if (previous === undefined) delete process.env.ACT05_ARS_MODE_ENABLED;
      else process.env.ACT05_ARS_MODE_ENABLED = previous;
    }
  });

  test("fails closed on an incomplete USD accounting row", async () => {
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([{ date: "2026-10-02", category_id: "expense", category: { group_id: "group-123", slug: "supermercado", name: "Supermercado", emoji: "🛒" }, amount_ars: 100, amount_usd: null, currency_mode: "USD_ARS", exchange_rate_snapshot: null }]);
    const response = await GET(new NextRequest("http://localhost:3000/api/export?month=2026-10&format=xlsx"));
    expect(response.status).toBe(409);
    expect(generateXLSX).not.toHaveBeenCalled();
  });

  test.each(["2025-00", "2025-13"])("returns 400 when month %s is outside 01-12", async (month) => {
    const req = new NextRequest(`http://localhost:3000/api/export?month=${month}&format=csv`);

    const response = await GET(req);

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Mes inválido. Usar valores entre 01 y 12.");
    expect(db.query.transactions.findMany).not.toHaveBeenCalled();
  });

  test("rejects null ARS amounts instead of exporting a fabricated zero", async () => {
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([
      {
        date: "2025-05-10",
        merchant: "Disco",
        category_id: "cat-1",
        category: { group_id: "group-123", slug: "supermercado", name: "Supermercado", emoji: "🛒" },
        amount_ars: null,
        amount_usd: 1,
        currency_mode: "USD_ARS",
        description: null,
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/export?month=2025-05&format=csv");

    const response = await GET(req);

    expect(response.status).toBe(409);
    expect(generateCSV).not.toHaveBeenCalled();
  });

  test("preserves XLSX response format, filename, and generated bytes", async () => {
    const req = new NextRequest("http://localhost:3000/api/export?month=2025-05&format=xlsx");

    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="hermes-2025-05.xlsx"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("xlsx-content"));
    expect(generateXLSX).toHaveBeenCalledWith([], []);
  });

  test("keeps income in movements but excludes it from expense and budget summaries", async () => {
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([
      { date: "2026-09-10", merchant: "Disco", category_id: "expense", category: { group_id: "group-123", slug: "supermercado", name: "Supermercado", emoji: "🛒" }, amount_ars: 137, amount_usd: 0.11, currency_mode: "USD_ARS", exchange_rate_snapshot: 1245.45, description: null },
      { date: "2026-09-11", merchant: null, category_id: "income", category: { group_id: "group-123", slug: "ingresos", name: "Ingresos", emoji: "💵" }, amount_ars: 2000, amount_usd: 1.61, currency_mode: "USD_ARS", exchange_rate_snapshot: null, description: "sueldo" },
    ]);
    (db.query.categories.findMany as jest.Mock).mockResolvedValue([
      { id: "expense", slug: "supermercado", name: "Supermercado", emoji: "🛒" },
      { id: "income", slug: "ingresos", name: "Ingresos", emoji: "💵" },
    ]);
    (db.query.budgets.findMany as jest.Mock).mockResolvedValue([
      { category_id: "expense", budget_ars: 500, hard_limit: 1 },
    ]);

    const xlsx = await GET(new NextRequest("http://localhost:3000/api/export?month=2026-09&format=xlsx"));
    expect(xlsx.status).toBe(200);
    expect(generateXLSX).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ categoryName: "Supermercado", amount_ars: 137 }),
        expect.objectContaining({ categoryName: "Ingresos", amount_ars: 2000 }),
      ]),
      [{ name: "Supermercado", emoji: "🛒", budget_ars: 500, gastado_ars: 137, hard_limit: 1 }],
    );

    const csv = await GET(new NextRequest("http://localhost:3000/api/export?month=2026-09&format=csv"));
    expect(csv.status).toBe(200);
    expect(generateCSV).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ categoryName: "Ingresos", amount_ars: 2000 }),
    ]));
  });
});
