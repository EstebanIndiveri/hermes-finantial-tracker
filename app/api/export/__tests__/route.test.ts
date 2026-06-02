import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { GET } from "../route";
import { db } from "@/lib/db/client";
import { generateCSV } from "@/lib/export/generate";

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
    },
  },
}));

jest.mock("@/lib/export/generate", () => ({
  generateCSV: jest.fn(() => "csv-content"),
  generateXLSX: jest.fn(() => Buffer.from("xlsx-content")),
}));

describe("GET /api/export", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (headers as jest.Mock).mockResolvedValue({
      get: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.categories.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.budgets.findMany as jest.Mock).mockResolvedValue([]);
  });

  test.each(["2025-00", "2025-13"])("returns 400 when month %s is outside 01-12", async (month) => {
    const req = new NextRequest(`http://localhost:3000/api/export?month=${month}&format=csv`);

    const response = await GET(req);

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Mes inválido. Usar valores entre 01 y 12.");
    expect(db.query.transactions.findMany).not.toHaveBeenCalled();
  });

  test("defaults null amount_ars to 0 before generating CSV", async () => {
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([
      {
        date: "2025-05-10",
        merchant: "Disco",
        category_id: "cat-1",
        category: { name: "Supermercado", emoji: "🛒" },
        amount_ars: null,
        description: null,
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/export?month=2025-05&format=csv");

    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(generateCSV).toHaveBeenCalledWith([
      {
        date: "2025-05-10",
        merchant: "Disco",
        categoryName: "Supermercado",
        categoryEmoji: "🛒",
        amount_ars: 0,
        description: null,
      },
    ]);
  });
});
