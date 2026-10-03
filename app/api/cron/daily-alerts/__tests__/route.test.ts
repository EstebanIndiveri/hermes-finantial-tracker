import { NextRequest } from "next/server";
import { GET } from "../route";
import { db } from "@/lib/db/client";
import { getMonthSummary, getCategoryBreakdown } from "@/lib/finance/summaries";
import { sendTelegramMessage } from "@/lib/telegram/send-message";
import { buildDailyAlert } from "@/lib/telegram/alerts";
import { resolveAuthorizedTelegramGroup } from "@/lib/telegram/authorized-group-context";
import { notifyReimbursementReminder, getUserById } from "@/lib/notifications/telegram";

jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(),
    query: {
      bot_messages: { findFirst: jest.fn() },
      transactions: { findMany: jest.fn() },
      split_sessions: { findMany: jest.fn() },
      splits: { findFirst: jest.fn() },
    },
  },
}));
jest.mock("@/lib/finance/summaries", () => ({ getMonthSummary: jest.fn(), getCategoryBreakdown: jest.fn() }));
jest.mock("@/lib/telegram/send-message", () => ({ sendTelegramMessage: jest.fn() }));
jest.mock("@/lib/telegram/alerts", () => ({ buildDailyAlert: jest.fn() }));
jest.mock("@/lib/telegram/authorized-group-context", () => ({ resolveAuthorizedTelegramGroup: jest.fn() }));
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
    expect(resolveAuthorizedTelegramGroup).not.toHaveBeenCalled();
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

  it("skips disabled notifications before database or provider work", async () => {
    process.env = {
      ...originalEnv,
      CRON_SECRET: "cron-secret",
      NOTIFICATIONS_ENABLED: "false",
    };

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      skipped: true,
      reason: "notifications_disabled",
      results: [],
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(notifyReimbursementReminder).not.toHaveBeenCalled();
  });

  it("fails closed on an invalid notifications setting before database work", async () => {
    process.env = {
      ...originalEnv,
      CRON_SECRET: "cron-secret",
      NOTIFICATIONS_ENABLED: "False",
    };

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Notifications unavailable" });
    expect(db.select).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  function setupDailyProcessing(users: Array<Record<string, unknown>>) {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret", TELEGRAM_CHAT_ID: "global-chat" };
    (db.select as jest.Mock)
      .mockReturnValueOnce({ from: jest.fn().mockResolvedValue(users) })
      .mockReturnValue({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([]) })) });
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.splits.findFirst as jest.Mock).mockResolvedValue(undefined);
    (resolveAuthorizedTelegramGroup as jest.Mock).mockResolvedValue("resolved-group");
    (getMonthSummary as jest.Mock).mockResolvedValue({
      income_usd: 1000,
      total_spent_usd: 100,
      ahorro_proyectado_usd: 900,
      saving_goal_usd: 100,
      status: "GREEN",
      exchange_rate: 1000,
    });
    (getCategoryBreakdown as jest.Mock).mockResolvedValue([]);
    (buildDailyAlert as jest.Mock).mockReturnValue({ shouldSend: true, message: "daily" });
  }

  it("uses each user's linked private Telegram ID instead of a stale chat or TELEGRAM_CHAT_ID", async () => {
    setupDailyProcessing([
      { id: "u1", telegram_user_id: "tg-u1", active_telegram_group_id: "g1" },
      { id: "u2", telegram_user_id: "tg-u2", active_telegram_group_id: "g2" },
    ]);
    (db.query.bot_messages.findFirst as jest.Mock)
      .mockResolvedValueOnce({ telegram_chat_id: "chat-u1" })
      .mockResolvedValueOnce({ telegram_chat_id: "chat-u2" });

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(sendTelegramMessage).toHaveBeenNthCalledWith(1, "tg-u1", "daily");
    expect(sendTelegramMessage).toHaveBeenNthCalledWith(2, "tg-u2", "daily");
    expect(sendTelegramMessage).not.toHaveBeenCalledWith("global-chat", expect.anything());
    expect(sendTelegramMessage).not.toHaveBeenCalledWith("chat-u1", expect.anything());
    expect(sendTelegramMessage).not.toHaveBeenCalledWith("chat-u2", expect.anything());
    expect(db.query.bot_messages.findFirst).not.toHaveBeenCalled();
    expect(resolveAuthorizedTelegramGroup).toHaveBeenNthCalledWith(1, "u1", "g1");
    expect(resolveAuthorizedTelegramGroup).toHaveBeenNthCalledWith(2, "u2", "g2");
  });

  it("uses the linked private Telegram ID when no bot message exists", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: "tg-u1", active_telegram_group_id: "g1" }]);
    (db.query.bot_messages.findFirst as jest.Mock).mockResolvedValue(undefined);

    await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(sendTelegramMessage).toHaveBeenCalledWith("tg-u1", "daily");
    expect(sendTelegramMessage).not.toHaveBeenCalledWith("global-chat", expect.anything());
  });

  it("skips summary processing when the user has no chat", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: null, active_telegram_group_id: "g1" }]);
    (db.query.bot_messages.findFirst as jest.Mock).mockResolvedValue(undefined);

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(await response.json()).toMatchObject({
      results: [{ userId: "u1", sent: false, reason: "no_chat_id" }],
    });
    expect(getMonthSummary).not.toHaveBeenCalled();
    expect(getCategoryBreakdown).not.toHaveBeenCalled();
    expect(db.query.transactions.findMany).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("does not build or send a USD alert when the monthly USD summary is unavailable", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: "tg-u1", active_telegram_group_id: "g1" }]);
    (getMonthSummary as jest.Mock).mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(await response.json()).toMatchObject({
      results: [{ userId: "u1", sent: false, reason: "summary_unavailable" }],
    });
    expect(buildDailyAlert).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("does not send to a stale group chat when the user has no linked private Telegram ID", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: null, active_telegram_group_id: "g1" }]);
    (db.query.bot_messages.findFirst as jest.Mock).mockResolvedValue({ telegram_chat_id: "stale-group-chat" });

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(await response.json()).toMatchObject({ results: [{ userId: "u1", sent: false, reason: "no_chat_id" }] });
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(db.query.bot_messages.findFirst).not.toHaveBeenCalled();
  });

  it("passes only expense transactions and categories to the daily alert projection", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: "tg-u1", active_telegram_group_id: "g1" }]);
    (db.query.transactions.findMany as jest.Mock).mockResolvedValue([
      { amount_ars: 2000, category: { slug: "ingresos", name: "Ingresos", emoji: "💵" } },
      { amount_ars: 137, category: { slug: "supermercado", name: "Supermercado", emoji: "🛒" } },
    ]);
    (getCategoryBreakdown as jest.Mock).mockResolvedValue([
      { name: "Ingresos", emoji: "💵", is_income: true, gastado_ars: 2000, budget_ars: 1000, status: "OK" },
      { name: "Supermercado", emoji: "🛒", is_income: false, gastado_ars: 137, budget_ars: 500, status: "OK" },
    ]);

    await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(buildDailyAlert).toHaveBeenCalledWith(expect.objectContaining({
      todayTransactions: [{ amount_ars: 137, category: "Supermercado", emoji: "🛒" }],
      categories: [{ name: "Supermercado", emoji: "🛒", gastado_ars: 137, budget_ars: 500, status: "OK" }],
    }));
  });

  it("skips stale or unauthorized group context", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: "tg-u1", active_telegram_group_id: "group-removed" }]);
    (db.query.bot_messages.findFirst as jest.Mock).mockResolvedValue({ telegram_chat_id: "chat-u1" });
    (resolveAuthorizedTelegramGroup as jest.Mock).mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(await response.json()).toMatchObject({
      results: [{ userId: "u1", sent: false, reason: "no_group" }],
    });
    expect(resolveAuthorizedTelegramGroup).toHaveBeenCalledWith("u1", "group-removed");
    expect(db.query.transactions.findMany).not.toHaveBeenCalled();
    expect(getMonthSummary).not.toHaveBeenCalled();
    expect(getCategoryBreakdown).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
