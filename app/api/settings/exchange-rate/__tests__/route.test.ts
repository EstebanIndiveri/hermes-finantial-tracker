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

jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
}));

import { getGroupMembership } from "@/lib/groups/permissions";

function makeReq(body: object, extraHeaders?: Record<string, string | null>) {
  const req = new NextRequest("http://localhost:3000/api/settings/exchange-rate", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const hdrs = { "x-user-id": "user-123", "x-group-id": "group-123", ...extraHeaders };
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => hdrs[key] ?? null),
  });
  return req;
}

describe("PATCH /api/settings/exchange-rate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getGroupMembership as jest.Mock).mockResolvedValue({ role: "owner" });
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = makeReq({ exchange_rate: 1200 }, { "x-user-id": null });
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });

  test("returns 401 when x-group-id header is missing", async () => {
    const req = makeReq({ exchange_rate: 1200 }, { "x-group-id": null });
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });

  test("returns 403 when user is a member", async () => {
    (getGroupMembership as jest.Mock).mockResolvedValue({ role: "member" });
    const req = makeReq({ exchange_rate: 1200 });
    const response = await PATCH(req);
    expect(response.status).toBe(403);
  });

  test("returns 404 when settings not found", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);
    const req = makeReq({ exchange_rate: 1200 });
    const response = await PATCH(req);
    expect(response.status).toBe(404);
  });

  test("returns 422 for missing exchange_rate", async () => {
    const req = makeReq({});
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for zero exchange_rate", async () => {
    const req = makeReq({ exchange_rate: 0 });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for negative exchange_rate", async () => {
    const req = makeReq({ exchange_rate: -100 });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for exchange_rate exceeding max", async () => {
    const req = makeReq({ exchange_rate: 20_000_000 });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("updates exchange rate successfully", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      group_id: "group-123",
      month: "2025-05",
    });

    const req = makeReq({ exchange_rate: 1200.50 });
    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.update).toHaveBeenCalled();
  });

  test("uses provided month parameter", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      group_id: "group-123",
      month: "2025-12",
    });

    const req = makeReq({ exchange_rate: 1200, month: "2025-12" });
    const response = await PATCH(req);
    expect(response.status).toBe(200);
  });

  test("sets exchange_rate_source to manual", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      group_id: "group-123",
      month: "2025-05",
    });

    const req = makeReq({ exchange_rate: 1200 });
    await PATCH(req);
    expect(db.update).toHaveBeenCalled();
  });
});
