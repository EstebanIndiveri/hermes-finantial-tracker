import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import * as datesUtil from "@/lib/utils/dates";
import * as rulesUtil from "@/lib/finance/rules";
import { createReimbursementWithNotifications } from "@/lib/reimbursements/requests";

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
    transaction: jest.fn(async (callback) => callback({
      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

jest.mock("@/lib/utils/dates");
jest.mock("@/lib/finance/rules");
jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
}));

jest.mock("@/lib/reimbursements/requests", () => ({
  createReimbursementWithNotifications: jest.fn(),
}));

describe("GET /api/transactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ACT05_ARS_MODE_ENABLED;
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(undefined);
    (datesUtil.getActiveMonthArgentina as jest.Mock).mockReturnValue("2025-05");
    const { getGroupMembership } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "group-123", user_id: "user-123", role: "member" });
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
        amount_usd: 10,
        month: "2025-04",
        status: "active",
      },
    ];

    (db.query.transactions.findMany as jest.Mock).mockResolvedValue(mockTransactions);

    const req = new NextRequest("http://localhost:3000/api/transactions?month=2025-04");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await GET(req);
    expect(response.status).toBe(200);
  });

  test("does not return nullable USD amounts from an ARS-only month", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS" });
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([
      { id: "tx-ars", amount_ars: 1000, amount_usd: null, month: "2025-05", status: "active" },
    ]);

    const req = new NextRequest("http://localhost:3000/api/transactions");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : key === "x-group-id" ? "group-123" : null),
    });

    const response = await GET(req);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CURRENCY_MODE_UNSUPPORTED" });
  });

  test("returns explicitly tagged ARS rows only when the feature flag is enabled", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS" });
    const rows = [{ id: "tx-ars", amount_ars: 1000, amount_usd: null, currency_mode: "ARS_ARS", exchange_rate_snapshot: null }];
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue(rows);
    const req = new NextRequest("http://localhost:3000/api/transactions");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : key === "x-group-id" ? "group-123" : null),
    });

    const response = await GET(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(rows);
  });

  test("rejects mixed-mode or pseudo-USD ARS rows even with the flag enabled", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS" });
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([
      { id: "bad-ars", amount_ars: 1000, amount_usd: 1, currency_mode: "ARS_ARS", exchange_rate_snapshot: null },
    ]);
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      headers: { "x-user-id": "user-123", "x-group-id": "group-123" },
    });
    expect((await GET(req)).status).toBe(409);
  });

  test("fails closed on nullable USD rows when month settings are missing", async () => {
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([
      { id: "tx-ars", amount_ars: 1000, amount_usd: null, currency_mode: "ARS_ARS" },
    ]);
    const req = new NextRequest("http://localhost:3000/api/transactions");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : key === "x-group-id" ? "group-123" : null),
    });

    const response = await GET(req);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CURRENCY_MODE_UNSUPPORTED" });
  });

  test("does not return deleted transactions", async () => {
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([]);

    const req = new NextRequest("http://localhost:3000/api/transactions");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
    delete process.env.ACT05_ARS_MODE_ENABLED;
    (datesUtil.getActiveMonthArgentina as jest.Mock).mockReturnValue("2025-05");
    (datesUtil.getArgentinaDate as jest.Mock).mockReturnValue(new Date("2025-05-15T12:00:00Z"));
    const { getGroupMembership } = require("@/lib/groups/permissions");
    getGroupMembership.mockResolvedValue({ group_id: "group-123", user_id: "user-123", role: "member" });
    
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

    (db.transaction as jest.Mock).mockImplementation(async (callback: (tx: any) => Promise<void>) => callback({
      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),
    }));

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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toHaveProperty("id");
    expect(data.amount_ars).toBe(5000);
    expect(data.amount_usd).toBe(5);
    expect(data.month).toBe("2025-05");
    expect((db.insert as jest.Mock).mock.results[0].value.values).toHaveBeenCalledWith(expect.objectContaining({
      amount_usd: 5,
      exchange_rate_snapshot: 1000,
      currency_mode: "USD_ARS",
    }));
  });

  test("creates an ARS transaction without inventing an FX rate when enabled", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS", exchange_rate: null });
    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);
    const values = jest.fn().mockResolvedValue(undefined);
    (db.insert as jest.Mock).mockReturnValue({ values });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({ category_id: "123e4567-e89b-12d3-a456-426614174000", amount_ars: 5000 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : key === "x-group-id" ? "group-123" : null),
    });

    const response = await POST(req);
    const data = await response.json();
    expect(response.status).toBe(201);
    expect(data).toMatchObject({ amount_ars: 5000, amount_usd: null, currency_mode: "ARS_ARS" });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      amount_ars: 5000,
      amount_usd: null,
      exchange_rate_snapshot: null,
      currency_mode: "ARS_ARS",
    }));
  });

  test("rejects ARS transactions while the feature flag is disabled", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS", exchange_rate: null });
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({ category_id: "123e4567-e89b-12d3-a456-426614174000", amount_ars: 5000 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : key === "x-group-id" ? "group-123" : null),
    });

    const response = await POST(req);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CURRENCY_MODE_UNSUPPORTED" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  test("creates reimbursement request when requiresReimbursement is true", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "ms-1",
      user_id: "user-123",
      month: "2025-05",
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);

    (db.transaction as jest.Mock).mockImplementation(async (callback: (tx: any) => Promise<void>) => callback({
      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    (createReimbursementWithNotifications as jest.Mock).mockResolvedValue({ id: "reimb-1" });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
        requiresReimbursement: true,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await POST(req);

    expect(response.status).toBe(201);
    expect(createReimbursementWithNotifications).toHaveBeenCalledTimes(1);
    expect(createReimbursementWithNotifications).toHaveBeenCalledWith(
      expect.any(String),
      "user-123",
      5000,
      undefined,
    );
  });

  test("does not create reimbursement request when requiresReimbursement is false", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "ms-1",
      user_id: "user-123",
      month: "2025-05",
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);

    (db.transaction as jest.Mock).mockImplementation(async (callback: (tx: any) => Promise<void>) => callback({
      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
        requiresReimbursement: false,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await POST(req);

    expect(response.status).toBe(201);
    expect(createReimbursementWithNotifications).not.toHaveBeenCalled();
  });

  test("passes payerId to reimbursement creation when provided", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "ms-1",
      user_id: "user-123",
      month: "2025-05",
      exchange_rate: 1000,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);

    (db.transaction as jest.Mock).mockImplementation(async (callback: (tx: any) => Promise<void>) => callback({
      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    (createReimbursementWithNotifications as jest.Mock).mockResolvedValue({ id: "reimb-1" });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
        requiresReimbursement: true,
        payerId: "payer-1",
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await POST(req);

    expect(response.status).toBe(201);
    expect(createReimbursementWithNotifications).toHaveBeenCalledWith(
      expect.any(String),
      "user-123",
      5000,
      "payer-1",
    );
  });

  test("returns 422 for missing category_id", async () => {
    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
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
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.amount_usd).toBe(5);
  });

  test("rejects hard limit in WARNING state even with is_exception=true", async () => {
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
        is_exception: true,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("BUDGET_EXCEEDED_HARD");
  });

  test("returns 500 when exchange_rate is 0 in monthly_settings", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 0,
    });

    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("exchange");
  });

  test("rejects ARS-only settings before writing through the USD-only path", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      currency_mode: "ARS_ARS",
      exchange_rate: null,
    });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : key === "x-group-id" ? "group-123" : null),
    });

    const response = await POST(req);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CURRENCY_MODE_UNSUPPORTED" });
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/transactions reimbursement integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "ms-1",
      user_id: "user-123",
      month: "2025-05",
      exchange_rate: 1000,
    });
    (db.query.budgets.findFirst as jest.Mock).mockResolvedValue(null);
  });

  test("creates a reimbursement request when the transaction requires reimbursement", async () => {
    (db.transaction as jest.Mock).mockImplementation(async (callback: (tx: any) => Promise<void>) => callback({
      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    (createReimbursementWithNotifications as jest.Mock).mockResolvedValue({ id: "reimb-1" });

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
        requiresReimbursement: true,
        payerId: "payer-1",
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await POST(req);

    expect(response.status).toBe(201);
    expect(createReimbursementWithNotifications).toHaveBeenCalledTimes(1);
    expect(createReimbursementWithNotifications).toHaveBeenCalledWith(
      expect.any(String),
      "user-123",
      5000,
      "payer-1",
    );
  });

  test("does not create a reimbursement request when reimbursement is not required", async () => {
    (db.transaction as jest.Mock).mockImplementation(async (callback: (tx: any) => Promise<void>) => callback({
      insert: jest.fn(() => ({
        values: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    const req = new NextRequest("http://localhost:3000/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        category_id: "123e4567-e89b-12d3-a456-426614174000",
        amount_ars: 5000,
        requiresReimbursement: false,
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => {
        if (key === "x-user-id") return "user-123";
        if (key === "x-group-id") return "group-123";
        return null;
      }),
    });

    const response = await POST(req);

    expect(response.status).toBe(201);
    expect(createReimbursementWithNotifications).not.toHaveBeenCalled();
  });
});
