import { NextRequest } from "next/server";
import { GET } from "../route";
import { getUpcomingExecutions, getOverdueExecutions } from "@/lib/db/recurring-queries";
import { materializeCanaryUpcomingExecutions } from "@/lib/notifications/recurring-canary-materialization";
import { hasProactiveConsent } from "@/lib/notifications/proactive-consent";
import { enqueueRecurringReminder } from "@/lib/notifications/recurring-reminder-delivery";

jest.mock("@/lib/db/recurring-queries", () => ({
  getUpcomingExecutions: jest.fn(),
  getOverdueExecutions: jest.fn(),
}));
jest.mock("@/lib/notifications/recurring-canary-materialization", () => ({ materializeCanaryUpcomingExecutions: jest.fn() }));
jest.mock("@/lib/notifications/proactive-consent", () => ({ hasProactiveConsent: jest.fn() }));
jest.mock("@/lib/notifications/recurring-reminder-delivery", () => ({
  ...jest.requireActual("@/lib/notifications/recurring-reminder-delivery"),
  enqueueRecurringReminder: jest.fn(),
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
      NOTIFICATIONS_ENABLED: "true",
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as typeof fetch;
    (getUpcomingExecutions as jest.Mock).mockResolvedValue([]);
    (getOverdueExecutions as jest.Mock).mockResolvedValue([]);
    jest.mocked(hasProactiveConsent).mockResolvedValue(true);
    jest.mocked(enqueueRecurringReminder).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it.each([
    ["missing secret", undefined, "Bearer undefined"],
    ["empty secret", "", "Bearer "],
    ["wrong token", "test-secret", "Bearer wrong"],
  ])("rejects %s before recurring reads or Telegram delivery", async (_name, secret, authorization) => {
    const env = { ...originalEnv };
    if (secret === undefined) delete env.CRON_SECRET;
    else env.CRON_SECRET = secret;
    process.env = env;

    const response = await GET(new NextRequest("http://localhost/api/cron/recurring-reminders", { headers: { authorization } }));

    expect(response.status).toBe(401);
    expect(getUpcomingExecutions).not.toHaveBeenCalled();
    expect(getOverdueExecutions).not.toHaveBeenCalled();
    expect(materializeCanaryUpcomingExecutions).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
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
      notificationsQueued: 0,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("skips disabled notifications before recurring reads or Telegram delivery", async () => {
    process.env.NOTIFICATIONS_ENABLED = "false";

    const response = await GET(new NextRequest("http://localhost/api/cron/recurring-reminders", {
      headers: { authorization: "Bearer test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      skipped: true,
      reason: "notifications_disabled",
      upcoming: 0,
      overdue: 0,
      notificationsQueued: 0,
    });
    expect(getUpcomingExecutions).not.toHaveBeenCalled();
    expect(getOverdueExecutions).not.toHaveBeenCalled();
    expect(materializeCanaryUpcomingExecutions).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("queues only the approved beta user and group in canary mode", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-15T11:00:00.000Z"));
    process.env = {
      ...process.env,
      NOTIFICATIONS_ENABLED: "false",
      HERMES_BETA_ISOLATION_ASSERT: "true",
      NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
      TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
      TELEGRAM_BOT_ID: "8739389202",
      RECURRING_REMINDER_CANARY_ENABLED: "true",
      RECURRING_REMINDER_CANARY_USER_ID: "user-A",
      RECURRING_REMINDER_CANARY_GROUP_ID: "group-A",
    };
    const candidate = (userId: string, groupId: string) => ({
      userId, groupId, telegramUserId: `chat-${userId}`,
      executions: [{ id: `exec-${userId}-${groupId}`, scheduledDate: "2026-08-25", amountArs: 100,
        recurringExpense: { name: "Internet", amountArs: 100, category: null } }],
    });
    (getUpcomingExecutions as jest.Mock).mockResolvedValue([
      candidate("user-A", "group-A"), candidate("user-B", "group-A"), candidate("user-A", "group-B"),
    ]);

    const response = await GET(new NextRequest("http://localhost/api/cron/recurring-reminders", {
      headers: { authorization: "Bearer test-secret" },
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).notificationsQueued).toBe(1);
    expect(enqueueRecurringReminder).toHaveBeenCalledTimes(1);
    expect(enqueueRecurringReminder).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-A",
      context: expect.objectContaining({ groupId: "group-A" }) }));
    expect(hasProactiveConsent).toHaveBeenCalledTimes(2);
    expect(materializeCanaryUpcomingExecutions).toHaveBeenCalledWith("user-A", "group-A", "2026-10-18");
  });

  it("does not materialize an occurrence when the QA user has not opted in", async () => {
    process.env = {
      ...process.env,
      NOTIFICATIONS_ENABLED: "false",
      HERMES_BETA_ISOLATION_ASSERT: "true",
      NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
      TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
      TELEGRAM_BOT_ID: "8739389202",
      RECURRING_REMINDER_CANARY_ENABLED: "true",
      RECURRING_REMINDER_CANARY_USER_ID: "user-A",
      RECURRING_REMINDER_CANARY_GROUP_ID: "group-A",
    };
    jest.mocked(hasProactiveConsent).mockResolvedValue(false);

    const response = await GET(new NextRequest("http://localhost/api/cron/recurring-reminders", {
      headers: { authorization: "Bearer test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(materializeCanaryUpcomingExecutions).not.toHaveBeenCalled();
    expect(enqueueRecurringReminder).not.toHaveBeenCalled();
  });

  it("fails closed on an invalid notifications setting before recurring reads", async () => {
    process.env.NOTIFICATIONS_ENABLED = "disabled";

    const response = await GET(new NextRequest("http://localhost/api/cron/recurring-reminders", {
      headers: { authorization: "Bearer test-secret" },
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Notifications unavailable" });
    expect(getUpcomingExecutions).not.toHaveBeenCalled();
    expect(getOverdueExecutions).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("queues upcoming and overdue reminders without calling Telegram", async () => {
    Date.now = jest.fn(() => new Date("2026-08-23T12:00:00.000Z").getTime());
    (getUpcomingExecutions as jest.Mock).mockResolvedValue([
      {
        userId: "u1",
        groupId: "g1",
        telegramUserId: "tg-1",
        executions: [
          {
            id: "exec-upcoming",
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
        groupId: "g2",
        telegramUserId: "tg-2",
        executions: [
          {
            id: "exec-overdue",
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
      notificationsQueued: 2,
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(enqueueRecurringReminder).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userId: "u1", chatId: "tg-1", context: expect.objectContaining({
        groupId: "g1", reminderKind: "upcoming", executionIds: ["exec-upcoming"],
      }),
    }));
    expect(enqueueRecurringReminder).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userId: "u2", chatId: "tg-2", context: expect.objectContaining({
        groupId: "g2", reminderKind: "overdue", executionIds: ["exec-overdue"],
      }),
    }));
  });

  it("never calls Telegram directly from the cron, even when a reminder is eligible", async () => {
    process.env.NOTIFICATIONS_ENABLED = "true";
    (getUpcomingExecutions as jest.Mock).mockResolvedValue([{
      userId: "u1",
      groupId: "g1",
      telegramUserId: "tg-1",
      executions: [{ id: "exec-1", scheduledDate: "2026-08-25", amountArs: 100,
        recurringExpense: { name: "Internet", amountArs: 100, category: null } }],
    }]);

    const response = await GET(new NextRequest("http://localhost/api/cron/recurring-reminders", {
      headers: { authorization: "Bearer test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("escapes configurable recurring labels in both reminder types", async () => {
    process.env.NOTIFICATIONS_ENABLED = "true";
    const execution = {
      scheduledDate: "2026-08-25",
      amountArs: 100,
      recurringExpense: {
        name: "A <b>& B",
        amountArs: 100,
        category: { emoji: "<icon>" },
      },
    };
    (getUpcomingExecutions as jest.Mock).mockResolvedValue([
      { userId: "u1", groupId: "g1", telegramUserId: "tg-1", executions: [{ id: "exec-1", ...execution }] },
    ]);
    (getOverdueExecutions as jest.Mock).mockResolvedValue([
      { userId: "u1", groupId: "g1", telegramUserId: "tg-1", executions: [{ id: "exec-1", ...execution }] },
    ]);

    await GET(new NextRequest("http://localhost/api/cron/recurring-reminders", {
      headers: { authorization: "Bearer test-secret" },
    }));

    expect(enqueueRecurringReminder).toHaveBeenCalledTimes(2);
    for (const [input] of jest.mocked(enqueueRecurringReminder).mock.calls) {
      expect(input.message).toContain("&lt;icon&gt; <b>A &lt;b&gt;&amp; B</b>");
      expect(input.message).not.toContain("<icon>");
    }
  });

  it("suppresses both reminder types when the recipient has not opted in", async () => {
    process.env.NOTIFICATIONS_ENABLED = "true";
    const data = [{ userId: "user-A", groupId: "group-A", telegramUserId: "telegram-A", executions: [{}] }];
    (getUpcomingExecutions as jest.Mock).mockResolvedValue(data);
    (getOverdueExecutions as jest.Mock).mockResolvedValue(data);
    jest.mocked(hasProactiveConsent).mockResolvedValue(false);

    const response = await GET(new NextRequest("http://localhost/api/cron/recurring-reminders", {
      headers: { authorization: "Bearer test-secret" },
    }));

    expect(response.status).toBe(200);
    expect(hasProactiveConsent).toHaveBeenCalledWith("user-A", "recurring");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(enqueueRecurringReminder).not.toHaveBeenCalled();
  });
});
