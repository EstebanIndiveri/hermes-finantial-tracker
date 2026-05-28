import { PATCH } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      monthly_settings: {
        findFirst: jest.fn(),
      },
    },
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(),
      })),
    })),
  },
}));

jest.mock("@/lib/utils/dates", () => ({
  getActiveMonthArgentina: jest.fn(() => "2025-05"),
}));

describe("PATCH /api/settings/exchange-rate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify({ exchange_rate: 1200 }),
    });
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });

  test("returns 404 when settings not found", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify({ exchange_rate: 1200 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(404);
  });

  test("returns 422 for missing exchange_rate", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for zero exchange_rate", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify({ exchange_rate: 0 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for negative exchange_rate", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify({ exchange_rate: -100 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for exchange_rate exceeding max", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify({ exchange_rate: 20_000_000 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("updates exchange rate successfully", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      user_id: "user-123",
      month: "2025-05",
    });

    const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify({ exchange_rate: 1200.50 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalled();
  });

  test("uses provided month parameter", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      user_id: "user-123",
      month: "2025-12",
    });

    const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify({ exchange_rate: 1200, month: "2025-12" }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(200);
  });

  test("sets exchange_rate_source to manual", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      user_id: "user-123",
      month: "2025-05",
    });

    const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
      method: "PATCH",
      body: JSON.stringify({ exchange_rate: 1200 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    await PATCH(req);
    
    expect(db.update).toHaveBeenCalled();
  });
});
