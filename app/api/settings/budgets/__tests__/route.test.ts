import { GET, PATCH } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([]),
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

jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
}));

import { getGroupMembership } from "@/lib/groups/permissions";

function makeReq(url: string, opts?: RequestInit, extraHeaders?: Record<string, string | null>) {
  const req = new NextRequest(url, opts);
  const hdrs = { "x-user-id": "user-123", "x-group-id": "group-123", ...extraHeaders };
  Object.defineProperty(req.headers, "get", {
    value: jest.fn((key: string) => hdrs[key] ?? null),
  });
  return req;
}

describe("GET /api/settings/budgets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 400 for invalid month format", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets?month=05-2025");
    const response = await GET(req);
    expect(response.status).toBe(400);
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets", {}, { "x-user-id": null });
    const response = await GET(req);
    expect(response.status).toBe(401);
  });

  test("returns 401 when x-group-id header is missing", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets", {}, { "x-group-id": null });
    const response = await GET(req);
    expect(response.status).toBe(401);
  });

  test("returns empty array when no budgets exist", async () => {
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([]),
      })),
    });

    const req = makeReq("http://localhost:3000/api/settings/budgets");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  test("returns budgets with correct shape", async () => {
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([
          { category_id: "cat-1", budget_ars: 50000, hard_limit: 1 },
          { category_id: "cat-2", budget_ars: 30000, hard_limit: 0 },
        ]),
      })),
    });

    const req = makeReq("http://localhost:3000/api/settings/budgets");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      { category_id: "cat-1", budget_ars: 50000, hard_limit: true },
      { category_id: "cat-2", budget_ars: 30000, hard_limit: false },
    ]);
  });
});

describe("PATCH /api/settings/budgets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getGroupMembership as jest.Mock).mockResolvedValue({ role: "owner" });
  });

  test("returns 401 when x-user-id header is missing", async () => {
    const req = makeReq(
      "http://localhost:3000/api/settings/budgets",
      { method: "PATCH", body: JSON.stringify({ items: [{ category_id: "123e4567-e89b-12d3-a456-426614174000", budget_ars: 1000, hard_limit: true }] }) },
      { "x-user-id": null },
    );
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });

  test("returns 401 when x-group-id header is missing", async () => {
    const req = makeReq(
      "http://localhost:3000/api/settings/budgets",
      { method: "PATCH", body: JSON.stringify({ items: [{ category_id: "123e4567-e89b-12d3-a456-426614174000", budget_ars: 1000, hard_limit: true }] }) },
      { "x-group-id": null },
    );
    const response = await PATCH(req);
    expect(response.status).toBe(401);
  });

  test("returns 403 when user is a member", async () => {
    (getGroupMembership as jest.Mock).mockResolvedValue({ role: "member" });
    const req = makeReq(
      "http://localhost:3000/api/settings/budgets",
      { method: "PATCH", body: JSON.stringify({ items: [{ category_id: "123e4567-e89b-12d3-a456-426614174000", budget_ars: 1000 }] }) },
    );
    const response = await PATCH(req);
    expect(response.status).toBe(403);
  });

  test("returns 422 for empty items array", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets", { method: "PATCH", body: JSON.stringify({ items: [] }) });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for missing items field", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets", { method: "PATCH", body: JSON.stringify({}) });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for invalid category_id (not UUID)", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets", { method: "PATCH", body: JSON.stringify({ items: [{ category_id: "invalid", budget_ars: 1000, hard_limit: true }] }) });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("returns 422 for negative budget_ars", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets", { method: "PATCH", body: JSON.stringify({ items: [{ category_id: "123e4567-e89b-12d3-a456-426614174000", budget_ars: -1000, hard_limit: true }] }) });
    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  test("creates or updates budget successfully", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets", { method: "PATCH", body: JSON.stringify({ items: [{ category_id: "123e4567-e89b-12d3-a456-426614174000", budget_ars: 50000, hard_limit: true }] }) });
    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.insert).toHaveBeenCalled();
  });

  test("processes multiple budget items", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets", {
      method: "PATCH",
      body: JSON.stringify({
        items: [
          { category_id: "123e4567-e89b-12d3-a456-426614174000", budget_ars: 50000, hard_limit: true },
          { category_id: "223e4567-e89b-12d3-a456-426614174001", budget_ars: 30000, hard_limit: false },
        ],
      }),
    });
    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  test("defaults hard_limit to true when not provided", async () => {
    const req = makeReq("http://localhost:3000/api/settings/budgets", { method: "PATCH", body: JSON.stringify({ items: [{ category_id: "123e4567-e89b-12d3-a456-426614174000", budget_ars: 50000 }] }) });
    const response = await PATCH(req);
    expect(response.status).toBe(200);
  });
});
