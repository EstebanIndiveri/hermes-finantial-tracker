import { NextRequest } from "next/server";
import { GET } from "../route";
import { getUpcomingExecutions, getOverdueExecutions } from "@/lib/db/recurring-queries";

jest.mock("@/lib/db/recurring-queries", () => ({
  getUpcomingExecutions: jest.fn(),
  getOverdueExecutions: jest.fn(),
}));

describe("GET /api/cron/recurring-reminders", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const originalDateNow = Date.now;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      CRON_SECRET: "test-secret",
      TELEGRAM_BOT_TOKEN: "test-bot-token",
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof fetch;
    (getUpcomingExecutions as jest.Mock).mockResolvedValue([]);
    (getOverdueExecutions as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    Date.now = originalDateNow;
  });

  it("returns 401 when authorization header is missing", async () => {
    const request = new NextRequest("http://localhost/api/cron/recurring-reminders");

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns counts without sending notifications when there are no telegram users", async () => {
    (getUpcomingExecutions as jest.Mock).mockResolvedValue([
      { userId: "u1", telegramUserId: null, executions: [] },
    ]);
    (getOverdueExecutions as jest.Mock).mockResolvedValue([
      { userId: "u2", telegramUserId: null, executions: [] },
    ]);

    const request = new NextRequest("http://localhost/api/cron/recurring-reminders", {
      headers: { authorization: "Bearer test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      upcoming: 1,
      overdue: 1,
      notificationsSent: 0,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends upcoming and overdue telegram notifications and reports sent count", async () => {
    Date.now = jest.fn(() => new Date("2026-08-23T12:00:00.000Z").getTime());
    (getUpcomingExecutions as jest.Mock).mockResolvedValue([
      {
        userId: "u1",
        telegramUserId: "tg-1",
        executions: [
          {
            scheduledDate: "2026-08-25",
            amountArs: null,
            recurringExpense: {
              name: "Internet",
              amountArs: 25000,
              category: { emoji: "🌐" },
            },
          },
        ],
      },
    ]);
    (getOverdueExecutions as jest.Mock).mockResolvedValue([
      {
        userId: "u2",
        telegramUserId: "tg-2",
        executions: [
          {
            scheduledDate: "2026-08-20",
            amountArs: 30000,
            recurringExpense: {
              name: "Alquiler",
              amountArs: 29000,
              category: { emoji: "🏠" },
            },
          },
        ],
      },
    ]);

    const request = new NextRequest("http://localhost/api/cron/recurring-reminders", {
      headers: { authorization: "Bearer test-secret" },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      upcoming: 1,
      overdue: 1,
      notificationsSent: 2,
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://api.telegram.org/bottest-bot-token/sendMessage",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://api.telegram.org/bottest-bot-token/sendMessage",
      expect.objectContaining({
        method: "POST",
      })
    );
  });
});
