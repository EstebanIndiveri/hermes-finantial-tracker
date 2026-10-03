import { GET, PATCH } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";

type MockTransaction = {
  query: {
    monthly_settings: { findFirst: jest.Mock };
    transactions: { findFirst: jest.Mock };
  };
  update: jest.Mock;
  insert: jest.Mock;
};

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      monthly_settings: {
        findFirst: jest.fn(),
      },
      transactions: { findFirst: jest.fn() },
    },
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(),
    })),
    transaction: jest.fn(async (callback: (tx: MockTransaction) => Promise<unknown>) => callback({
      query: {
        monthly_settings: { findFirst: jest.fn((...args: unknown[]) => (db.query.monthly_settings.findFirst as jest.Mock)(...args)) },
        transactions: { findFirst: jest.fn() },
      },
      update: jest.fn((...args: unknown[]) => (db.update as jest.Mock)(...args)),
      insert: jest.fn((...args: unknown[]) => (db.insert as jest.Mock)(...args)),
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

    expect(data).toEqual({ ...mockSettings, currency_mode: "USD_ARS" });
  });

  test("treats a legacy row without currency_mode as USD_ARS", async () => {
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ month: "2025-05" });
    const response = await GET(makeReq("http://localhost:3000/api/settings/monthly?month=2025-05"));
    expect(await response.json()).toMatchObject({ currency_mode: "USD_ARS" });
  });

  test("exposes feature availability and movement lock without changing the settings payload", async () => {
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);
    (db.query.transactions.findFirst as jest.Mock).mockResolvedValue({ id: "existing" });
    const response = await GET(makeReq("http://localhost:3000/api/settings/monthly?month=2025-05"));
    expect(await response.json()).toBeNull();
    expect(response.headers.get("X-ARS-Mode-Enabled")).toBe("true");
    expect(response.headers.get("X-Currency-Mode-Locked")).toBe("true");
    delete process.env.ACT05_ARS_MODE_ENABLED;
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
    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ income_usd: 5000, exchange_rate: 1200 }) });
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
    const newSettings = { id: "new-setting-123", user_id: "user-123", group_id: "group-123", month: "2025-05", currency_mode: "USD_ARS", income_usd: 5000, exchange_rate: 1200, exchange_rate_source: "manual", exchange_rate_updated_at: null, saving_goal_usd: 0, saving_goal_yellow: 0, created_at: Date.now() };

    (db.query.monthly_settings.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(newSettings);

    const req = makeReq("http://localhost:3000/api/settings/monthly", { method: "PATCH", body: JSON.stringify({ income_usd: 5000, exchange_rate: 1200 }) });
    const response = await PATCH(req);
    const data = await response.json();

    expect(db.insert).toHaveBeenCalled();
    expect(data.income_usd).toBe(5000);
  });

  test("rejects currency-specific fields that do not match the requested mode", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", {
      method: "PATCH", body: JSON.stringify({ currency_mode: "ARS_ARS", income_usd: 500 }),
    });
    expect((await PATCH(req)).status).toBe(422);
  });

  test("rejects a mode change when any movement exists for the group and month", async () => {
    const previousFlag = process.env.ACT05_ARS_MODE_ENABLED;
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    (db.transaction as jest.Mock).mockImplementationOnce(async (callback: (tx: MockTransaction) => Promise<unknown>) => callback({
      query: {
        monthly_settings: { findFirst: jest.fn().mockResolvedValue({ currency_mode: "USD_ARS" }) },
        transactions: { findFirst: jest.fn().mockResolvedValue({ id: "deleted-movement" }) },
      },
      update: jest.fn(), insert: jest.fn(),
    }));
    const req = makeReq("http://localhost:3000/api/settings/monthly", {
      method: "PATCH", body: JSON.stringify({ currency_mode: "ARS_ARS", income_ars: 1000 }),
    });
    expect((await PATCH(req)).status).toBe(409);
    if (previousFlag === undefined) delete process.env.ACT05_ARS_MODE_ENABLED;
    else process.env.ACT05_ARS_MODE_ENABLED = previousFlag;
  });

  test("requires an explicit exchange rate when creating USD_ARS settings", async () => {
    const req = makeReq("http://localhost:3000/api/settings/monthly", {
      method: "PATCH", body: JSON.stringify({ income_usd: 5000 }),
    });
    expect((await PATCH(req)).status).toBe(422);
  });

  test("keeps ARS_ARS creation behind its feature gate", async () => {
    delete process.env.ACT05_ARS_MODE_ENABLED;
    const req = makeReq("http://localhost:3000/api/settings/monthly", {
      method: "PATCH", body: JSON.stringify({ currency_mode: "ARS_ARS", income_ars: 1000 }),
    });
    expect((await PATCH(req)).status).toBe(409);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("creates ARS_ARS settings with USD amounts and exchange rate unset when enabled", async () => {
    const priorFlag = process.env.ACT05_ARS_MODE_ENABLED;
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    const saved = {
      id: "setting-ars", user_id: "user-123", group_id: "group-123", month: "2025-05",
      currency_mode: "ARS_ARS", income_ars: 100000, saving_goal_ars: 25000,
      saving_goal_yellow_ars: 10000, income_usd: null, saving_goal_usd: null,
      saving_goal_yellow: null, exchange_rate: null,
    };
    (db.query.monthly_settings.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(saved);
    const req = makeReq("http://localhost:3000/api/settings/monthly", {
      method: "PATCH", body: JSON.stringify({ currency_mode: "ARS_ARS", income_ars: 100000 }),
    });
    const response = await PATCH(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ currency_mode: "ARS_ARS", income_usd: null, exchange_rate: null });
    if (priorFlag === undefined) delete process.env.ACT05_ARS_MODE_ENABLED;
    else process.env.ACT05_ARS_MODE_ENABLED = priorFlag;
  });
});
