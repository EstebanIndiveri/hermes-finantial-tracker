import { NextRequest } from "next/server";
import { GET } from "../route";
import { db } from "@/lib/db/client";
import { createMonthlyExecutions, getPendingExecutions } from "@/lib/db/recurring-queries";
import { sendTelegramMessage } from "@/lib/telegram/send-message";

jest.mock("@/lib/db/client", () => ({ db: { select: jest.fn() } }));
jest.mock("@/lib/db/recurring-queries", () => ({
  createMonthlyExecutions: jest.fn(),
  getPendingExecutions: jest.fn(),
}));
jest.mock("@/lib/telegram/send-message", () => ({
  sendTelegramMessage: jest.fn(),
  buildPersonalKeyboard: jest.fn(),
}));

describe("GET /api/cron/recurring authorization", () => {
  const originalEnv = process.env;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => { process.env = originalEnv; });

  it.each([
    ["missing secret", undefined, "Bearer undefined"],
    ["empty secret", "", "Bearer "],
    ["wrong token", "cron-secret", "Bearer wrong"],
  ])("rejects %s before recurring writes, reads, or notifications", async (_name, secret, authorization) => {
    const env = { ...originalEnv };
    if (secret === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = secret;
    process.env = env;

    const response = await GET(new NextRequest("http://localhost/api/cron/recurring?userId=user-1", { headers: { authorization } }));

    expect(response.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
    expect(createMonthlyExecutions).not.toHaveBeenCalled();
    expect(getPendingExecutions).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("allows the authenticated manual user mode", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret" };
    (createMonthlyExecutions as jest.Mock).mockResolvedValue(2);
    (getPendingExecutions as jest.Mock).mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost/api/cron/recurring?userId=user-1", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, created: 2, pendingCount: 0, testMode: true });
    expect(createMonthlyExecutions).toHaveBeenCalledWith("user-1");
    expect(getPendingExecutions).toHaveBeenCalledWith("user-1");
  });
});
