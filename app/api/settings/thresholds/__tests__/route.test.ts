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

describe("PATCH /api/settings/thresholds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/thresholds", {
      method: "PATCH",
      body: JSON.stringify({ saving_goal_usd: 1000, saving_goal_yellow: 500 }),
    });
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });

  test("returns 404 when settings not found", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/settings/thresholds", {
      method: "PATCH",
      body: JSON.stringify({ saving_goal_usd: 1000, saving_goal_yellow: 500 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(404);
  });

  test("returns 422 for negative saving_goal_usd", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/thresholds", {
      method: "PATCH",
      body: JSON.stringify({ saving_goal_usd: -100, saving_goal_yellow: 50 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for negative saving_goal_yellow", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/thresholds", {
      method: "PATCH",
      body: JSON.stringify({ saving_goal_usd: 100, saving_goal_yellow: -50 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for missing saving_goal_usd", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/thresholds", {
      method: "PATCH",
      body: JSON.stringify({ saving_goal_yellow: 50 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for missing saving_goal_yellow", async () => {
    const req = new NextRequest("http://localhost:3000/api/settings/thresholds", {
      method: "PATCH",
      body: JSON.stringify({ saving_goal_usd: 100 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("updates thresholds successfully", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      user_id: "user-123",
      month: "2025-05",
    });

    const req = new NextRequest("http://localhost:3000/api/settings/thresholds", {
      method: "PATCH",
      body: JSON.stringify({ saving_goal_usd: 1000, saving_goal_yellow: 500 }),
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

  test("accepts zero values for goals", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      user_id: "user-123",
      month: "2025-05",
    });

    const req = new NextRequest("http://localhost:3000/api/settings/thresholds", {
      method: "PATCH",
      body: JSON.stringify({ saving_goal_usd: 0, saving_goal_yellow: 0 }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
  });

  test("uses provided month parameter", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      user_id: "user-123",
      month: "2025-12",
    });

    const req = new NextRequest("http://localhost:3000/api/settings/thresholds", {
      method: "PATCH",
      body: JSON.stringify({ 
        saving_goal_usd: 1000, 
        saving_goal_yellow: 500,
        month: "2025-12" 
      }),
    });
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "x-user-id" ? "user-123" : null),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(200);
  });
});
