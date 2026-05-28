import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import * as datesUtil from "@/lib/utils/dates";
import * as rulesUtil from "@/lib/finance/rules";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      transactions: {
        findMany: jest.fn(),
      },
      monthly_settings: {
        findFirst: jest.fn(),
      },
      budgets: {
        findFirst: jest.fn(),
      },
      categories: {
        findFirst: jest.fn(),
      },
    },
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(),
    })),
  },
}));

jest.mock("@/lib/utils/dates");
jest.mock("@/lib/finance/rules");

describe("GET /api/transactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (datesUtil.getActiveMonthArgentina as jest.Mock).mockReturnValue("2025-05");
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn(() => null),
    });

    const response = await GET(req);
    expect(response.status).toBe(401);
  });

  test("returns active transactions for user and default month", async () => {
    const mockTransactions = [
      {
        id: "tx-1",
        user_id: "user-123",
        category_id: "cat-1",
        amount_ars: 1000,
        amount_usd: 10,
        month: "2025-05",
        status: "active",
        category: { id: "cat-1", name: "Food" },
      },
    ];

    (db.query.transactions.findMany as jest.Mock).mockResolvedValue(mockTransactions);

    const req = new NextRequest("http://localhost:3000/api/transactions");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockTransactions);
    expect(db.query.transactions.findMany).toHaveBeenCalled();
  });

  test("returns active transactions for specified month", async () => {
    const mockTransactions = [
      {
        id: "tx-1",
        user_id: "user-123",
        month: "2025-04",
        status: "active",
      },
    ];

    (db.query.transactions.findMany as jest.Mock).mockResolvedValue(mockTransactions);

    const req = new NextRequest("http://localhost:3000/api/transactions?month=2025-04");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await GET(req);
    expect(response.status).toBe(200);
  });

  test("does not return deleted transactions", async () => {
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([]);

    const req = new NextRequest("http://localhost:3000/api/transactions");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });
});

describe("POST /api/transactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (datesUtil.getActiveMonthArgentina as jest.Mock).mockReturnValue("2025-05");
    (datesUtil.getArgentinaDate as jest.Mock).mockReturnValue(new Date("2025-05-15T12:00:00Z"));
    
    // Default category mock - tests can override if needed
    (db.query.categories.findFirst as jest.Mock).mockResolvedValue({
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Food",
    });
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn(() => null),
    });

    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  test("creates transaction successfully (happy path)", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "ms-1",
      user_id: "user-123",
      month: "2025-05",
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);

    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
        merchant: "Test Store",
        description: "Test purchase",
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toHaveProperty("id");
    expect(data.amount_ars).toBe(5000);
    expect(data.amount_usd).toBe(5);
    expect(data.month).toBe("2025-05");
  });

  test("returns 422 for missing category_id", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for invalid category_id (not UUID)", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "invalid",
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for negative amount", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: -5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for zero amount", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 0,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for excessive amount", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 200_000_000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(422);
  });

  test("returns 400 when no monthly settings found", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("configuración");
  });

  test("returns 404 when category not found", async () => {
    (db.query.categories.findFirst as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Category not found");
  });

  test("returns 400 (CATEGORY_CLOSED) when category is CLOSED with hard_limit and no exception", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue({
      budget_ars: 10000,
      hard_limit: 1,
    });

    const mockSelect = {
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ total: "12000" }]),
      })),
    };
    (db.select as jest.Mock).mockReturnValue(mockSelect);

    (rulesUtil.calculateCategoryStatus as jest.Mock).mockReturnValue("CLOSED");

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 1000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("CATEGORY_CLOSED");
  });

  test("returns 422 (BUDGET_EXCEEDED_SOFT) when category is CLOSED with soft limit and no exception", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue({
      budget_ars: 10000,
      hard_limit: 0,
    });

    const mockSelect = {
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ total: "12000" }]),
      })),
    };
    (db.select as jest.Mock).mockReturnValue(mockSelect);

    (rulesUtil.calculateCategoryStatus as jest.Mock).mockReturnValue("CLOSED");

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 1000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.code).toBe("BUDGET_EXCEEDED_SOFT");
  });

  test("allows transaction when is_exception=true even if CLOSED (soft limit)", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue({
      budget_ars: 10000,
      hard_limit: 0,
    });

    const mockSelect = {
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ total: "12000" }]),
      })),
    };
    (db.select as jest.Mock).mockReturnValue(mockSelect);

    (rulesUtil.calculateCategoryStatus as jest.Mock).mockReturnValue("CLOSED");

    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 1000,
        is_exception: true,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(201);
  });

  test("rejects transaction when is_exception=true but category has hard_limit and is CLOSED", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue({
      budget_ars: 10000,
      hard_limit: 1,
    });

    const mockSelect = {
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ total: "12000" }]),
      })),
    };
    (db.select as jest.Mock).mockReturnValue(mockSelect);

    (rulesUtil.calculateCategoryStatus as jest.Mock).mockReturnValue("CLOSED");

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 1000,
        is_exception: true,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("CATEGORY_CLOSED");
  });

  test("returns 400 (BUDGET_EXCEEDED_HARD) when amount would exceed budget with hard_limit", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue({
      budget_ars: 10000,
      hard_limit: 1,
    });

    const mockSelect = {
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ total: "8000" }]),
      })),
    };
    (db.select as jest.Mock).mockReturnValue(mockSelect);

    (rulesUtil.calculateCategoryStatus as jest.Mock).mockReturnValue("WARNING");

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("BUDGET_EXCEEDED_HARD");
  });

  test("allows transaction when budget is zero (no budget set)", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue({
      budget_ars: 0,
      hard_limit: 1,
    });

    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(201);
  });

  test("allows transaction when no budget exists for category", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);

    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(201);
  });

  test("uses custom date when provided", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);

    const insertMock = jest.fn().mockResolvedValue(undefined);
    (db.insert as jest.Mock).mockReturnValue({
      values: insertMock,
    });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
        date: "2025-05-20",
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(201);
  });

  test("returns 422 for invalid date format", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
        date: "2025/05/20",
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    expect(response.status).toBe(422);
  });

  test("calculates amount_usd correctly based on exchange_rate", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1200,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);

    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 6000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => (key === "x-user-id" ? "user-123" : null)),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount_usd).toBe(5);
  });
});
