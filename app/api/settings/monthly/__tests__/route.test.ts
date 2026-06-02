import { GET, PATCH } from "../route";
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
    insert: jest.fn(() => ({
      values: jest.fn(),
    })),
  },
}));

jest.mock("@/lib/utils/dates", () => ({
  getActiveMonthArgentina: jest.fn(() => "2025-05"),
}));

jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
}));

import { getGroupMembership } from "@/lib/groups/permissions";

function makeReq(url: string, opts?: RequestInit, headers?: Record<string, string | null>) {
  const req = new NextRequest(url, opts);
  const hdrs = { "x-user-id": "user-123", "x-group-id": "group-123", ...headers };
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => hdrs[key] ?? null),
  });
  return req;
}

describe("GET /api/settings/monthly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", {}, { "x-user-id": null });
    const response = await GET(req);
    expect(response.status).toBe(401);
  });

  test("returns 401 when x-group-id header is missing", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", {}, { "x-group-id": null });
    const response = await GET(req);
    expect(response.status).toBe(401);
  });

  test("returns 400 for invalid month format", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly?month=05-2025");
    const response = await GET(req);
    expect(response.status).toBe(400);
  });

  test("returns null when no settings exist", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);

    const req = makeReq("http://localhost:3000/api/settings/monthly");
    const response = await GET(req);
    const data = await response.json();

    expect(data).toBeNull();
    expect(db.query.monthly_settings.findFirst).toHaveBeenCalled();
  });

  test("returns existing settings for the month", async () => {
    const mockSettings = {
      id: "setting-123",
      user_id: "user-123",
      group_id: "group-123",
      month: "2025-05",
      income_usd: 5000,
      exchange_rate: 1200,
      exchange_rate_source: "ripio",
      exchange_rate_updated_at: Date.now(),
      saving_goal_usd: 1000,
      saving_goal_yellow: 500,
      created_at: Date.now(),
    };

    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(mockSettings);

    const req = makeReq("http://localhost:3000/api/settings/monthly?month=2025-05");
    const response = await GET(req);
    const data = await response.json();

    expect(data).toEqual(mockSettings);
  });

  test("uses current month if month param not provided", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);

    const req = makeReq("http://localhost:3000/api/settings/monthly");
    await GET(req);

    expect(db.query.monthly_settings.findFirst).toHaveBeenCalled();
  });
});

describe("PATCH /api/settings/monthly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getGroupMembership as jest.Mock).mockResolvedValue({ role: "owner" });
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ income_usd: 5000 }) }, { "x-user-id": null });
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });

  test("returns 401 when x-group-id header is missing", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ income_usd: 5000 }) }, { "x-group-id": null });
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });

  test("returns 403 when user is a member", async () => {
    (getGroupMembership as jest.Mock).mockResolvedValue({ role: "member" });
    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ income_usd: 5000 }) });
    const response = await PATCH(req);
    expect(response.status).toBe(403);
  });

  test("returns 422 for invalid income_usd (negative)", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ income_usd: -100 }) });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for invalid exchange_rate (zero)", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ exchange_rate: 0 }) });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for invalid month format", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ month: "05-2025" }) });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for invalid JSON body", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: "not json" });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("updates existing settings", async () => {
    const existing = { id: "setting-123", user_id: "user-123", group_id: "group-123", month: "2025-05", income_usd: 3000, exchange_rate: 1100, exchange_rate_source: "manual", exchange_rate_updated_at: null, saving_goal_usd: 500, saving_goal_yellow: 200, created_at: Date.now() };
    const updated = { ...existing, income_usd: 5000 };

    (db.query.monthly_settings.findFirst as jest.Mock)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);

    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ income_usd: 5000 }) });
    const response = await PATCH(req);
    const data = await response.json();

    expect(db.update).toHaveBeenCalled();
    expect(data.income_usd).toBe(5000);
  });

  test("creates new settings if none exist", async () => {
    const newSettings = { id: "new-setting-123", user_id: "user-123", group_id: "group-123", month: "2025-05", income_usd: 5000, exchange_rate: 1, exchange_rate_source: "manual", exchange_rate_updated_at: null, saving_goal_usd: 0, saving_goal_yellow: 0, created_at: Date.now() };

    (db.query.monthly_settings.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(newSettings);

    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ income_usd: 5000 }) });
    const response = await PATCH(req);
    const data = await response.json();

    expect(db.insert).toHaveBeenCalled();
    expect(data.income_usd).toBe(5000);
  });
});
