import { NextRequest } from "next/server";
import { GET } from "../route";
import { db } from "@/lib/db/client";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { getPersonalGroup } from "@/lib/groups/permissions";
import { notifyReimbursementReminder, getUserById } from "@/lib/notifications/telegram";

jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(),
    query: { split_sessions: { findMany: jest.fn() } },
  },
}));
jest.mock("@/lib/finance/summaries", () => ({ getMonthSummary: jest.fn(), getCategoryBreakdown: jest.fn() }));
jest.mock("@/lib/telegram/send-message", () => ({ sendTelegramMessage: jest.fn() }));
jest.mock("@/lib/telegram/alerts", () => ({ buildDailyAlert: jest.fn() }));
jest.mock("@/lib/groups/permissions", () => ({ getPersonalGroup: jest.fn() }));
jest.mock("@/lib/notifications/telegram", () => ({ notifyReimbursementReminder: jest.fn(), getUserById: jest.fn() }));

describe("GET /api/cron/daily-alerts authorization", () => {
  const originalEnv = process.env;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => { process.env = originalEnv; });

  it.each([
    ["missing secret", undefined, "Bearer undefined"],
    ["empty secret", "", "Bearer "],
    ["wrong token", "cron-secret", "Bearer wrong"],
  ])("rejects %s before database reads or alert delivery", async (_name, secret, authorization) => {
    const env = { ...originalEnv };
    if (secret === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = secret;
    process.env = env;

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", { headers: { authorization } }));

    expect(response.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
    expect(getMonthSummary).not.toHaveBeenCalled();
    expect(getCategoryBreakdown).not.toHaveBeenCalled();
    expect(getPersonalGroup).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(notifyReimbursementReminder).not.toHaveBeenCalled();
  });

  it("continues with daily processing for the exact configured token", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret" };
    const from = jest.fn(() => ({ where: jest.fn().mockResolvedValue([]) }));
    (db.select as jest.Mock)
      .mockReturnValueOnce({ from: jest.fn().mockResolvedValue([]) })
      .mockReturnValue({ from });
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, results: [] });
    expect(db.select).toHaveBeenCalled();
  });
});
