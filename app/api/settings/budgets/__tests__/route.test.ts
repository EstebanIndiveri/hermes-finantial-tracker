import { PATCH } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      budgets: {
        findFirst: jest.fn(),
      },
    },
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoUpdate: jest.fn(),
      })),
    })),
  },
}));

jest.mock("@/lib/utils/dates", () => ({
  getActiveMonthArgentina: jest.fn(() => "2025-05"),
}));

describe("PATCH /api/settings/budgets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({ items: [{ category_id: "123e4567-e89b-12d3-a456-426614174000", budget_ars: 1000, hard_limit: true }] }),
    });
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });

  test("returns 422 for empty items array", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({ items: [] }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for missing items field", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for invalid category_id (not UUID)", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({ 
        items: [{ category_id: "invalid", budget_ars: 1000, hard_limit: true }] 
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for negative budget_ars", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({ 
        items: [{
          category_id: "123e4567-e89b-12d3-a456-426614174000",
          budget_ars: -1000,
          hard_limit: true
        }] 
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("creates new budget when none exists", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({ 
        items: [{
          category_id: "123e4567-e89b-12d3-a456-426614174000",
          budget_ars: 50000,
          hard_limit: true
        }] 
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.insert).toHaveBeenCalled();
  });

  test("updates existing budget", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({ 
        items: [{
          category_id: "123e4567-e89b-12d3-a456-426614174000",
          budget_ars: 50000,
          hard_limit: false
        }] 
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.insert).toHaveBeenCalled();
  });

  test("processes multiple budget items", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({ 
        items: [
          {
            category_id: "123e4567-e89b-12d3-a456-426614174000",
            budget_ars: 50000,
            hard_limit: true
          },
          {
            category_id: "223e4567-e89b-12d3-a456-426614174001",
            budget_ars: 30000,
            hard_limit: false
          }
        ] 
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  test("defaults hard_limit to true when not provided", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({ 
        items: [{
          category_id: "123e4567-e89b-12d3-a456-426614174000",
          budget_ars: 50000
        }] 
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(200);
  });
});
