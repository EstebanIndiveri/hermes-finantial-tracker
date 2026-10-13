import { NextRequest } from "next/server";
import { GET } from "../route";
import { db } from "@/lib/db/client";
import { getMonthSummary, getCategoryBreakdown, getAccountingMonthProjection } from "@/lib/finance/summaries";
import { enqueueDailySummary } from "@/lib/notifications/daily-summary-delivery";
import { buildDailyAlert } from "@/lib/telegram/alerts";
import { resolveAuthorizedTelegramGroup } from "@/lib/telegram/authorized-group-context";
import { notifyReimbursementReminder, getUserById } from "@/lib/notifications/telegram";
import { getGroupMembership } from "@/lib/groups/permissions";
import { hasProactiveConsent } from "@/lib/notifications/proactive-consent";

jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
    query: {
      bot_messages: { findFirst: jest.fn() },
      transactions: { findMany: jest.fn() },
      split_sessions: { findMany: jest.fn() },
      splits: { findFirst: jest.fn() },
      monthly_settings: { findFirst: jest.fn() },
    },
  },
}));
jest.mock("@/lib/finance/summaries", () => ({ getMonthSummary: jest.fn(), getCategoryBreakdown: jest.fn(), getAccountingMonthProjection: jest.fn() }));
jest.mock("@/lib/notifications/daily-summary-delivery", () => ({ enqueueDailySummary: jest.fn() }));
jest.mock("@/lib/telegram/alerts", () => ({ buildDailyAlert: jest.fn() }));
jest.mock("@/lib/telegram/authorized-group-context", () => ({ resolveAuthorizedTelegramGroup: jest.fn() }));
jest.mock("@/lib/notifications/telegram", () => ({ notifyReimbursementReminder: jest.fn(), getUserById: jest.fn() }));
jest.mock("@/lib/groups/permissions", () => ({ getGroupMembership: jest.fn() }));
jest.mock("@/lib/notifications/proactive-consent", () => ({ hasProactiveConsent: jest.fn() }));

describe("GET /api/cron/daily-alerts authorization", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    (db.select as jest.Mock).mockReset();
    (hasProactiveConsent as jest.Mock).mockResolvedValue(true);
    (enqueueDailySummary as jest.Mock).mockResolvedValue(true);
  });
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
    expect(enqueueDailySummary).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(notifyReimbursementReminder).not.toHaveBeenCalled();
  });

  it("continues with daily processing for the exact configured token", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret", NOTIFICATIONS_ENABLED: "true" };
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

  it("never sends to a stored session chat while its group and recipients are unverified", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret", NOTIFICATIONS_ENABLED: "true" };
    const from = jest.fn(() => ({ where: jest.fn().mockResolvedValue([]) }));
    (db.select as jest.Mock)
      .mockReturnValueOnce({ from: jest.fn().mockResolvedValue([]) })
      .mockReturnValue({ from });
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([{
      id: "session-1", name: "Viaje <script>&", telegram_chat_id: "chat-1", last_alert_at: null,
    }]);
    (db.query.splits.findFirst as jest.Mock).mockResolvedValue({ id: "split-1" });

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(enqueueDailySummary).not.toHaveBeenCalled();
    expect(db.query.splits.findFirst).not.toHaveBeenCalled();
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
    expect(enqueueDailySummary).not.toHaveBeenCalled();
    expect(notifyReimbursementReminder).not.toHaveBeenCalled();
  });

  it("skips a missing proactive flag instead of using the legacy default", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret" };
    delete process.env.NOTIFICATIONS_ENABLED;
    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(await response.json()).toMatchObject({ skipped: true, reason: "notifications_disabled" });
    expect(db.select).not.toHaveBeenCalled();
    expect(enqueueDailySummary).not.toHaveBeenCalled();
  });

  it("does not remind a former payer about another group's reimbursement", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret", NOTIFICATIONS_ENABLED: "true" };
    (db.select as jest.Mock)
      .mockReturnValueOnce({ from: jest.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{
        id: "reimb-old", transactionId: "transaction-old", payerId: "former-member",
        requesterId: "requester", amount: 137, createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
      }]) })) })
      .mockReturnValueOnce({ from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([{
        groupId: "group-old", status: "active", deletedAt: null,
      }]) })) })) });
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([]);
    (getGroupMembership as jest.Mock).mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(getGroupMembership).toHaveBeenCalledWith("former-member", "group-old");
    expect(notifyReimbursementReminder).not.toHaveBeenCalled();
  });

  it("reminds a current payer only when the requester still belongs to the source group", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret", NOTIFICATIONS_ENABLED: "true" };
    (db.select as jest.Mock)
      .mockReturnValueOnce({ from: jest.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{
        id: "reimb-current", transactionId: "transaction-current", payerId: "payer",
        requesterId: "requester", amount: 130, createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
      }]) })) })
      .mockReturnValueOnce({ from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([{
        groupId: "group-current", status: "active", deletedAt: null,
      }]) })) })) });
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([]);
    (getGroupMembership as jest.Mock)
      .mockResolvedValueOnce({ group_id: "group-current", user_id: "payer", role: "member" })
      .mockResolvedValueOnce({ group_id: "group-current", user_id: "requester", role: "owner" });
    (getUserById as jest.Mock).mockResolvedValue({ name: "Requester" });

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(getGroupMembership).toHaveBeenCalledWith("payer", "group-current");
    expect(getGroupMembership).toHaveBeenCalledWith("requester", "group-current");
    expect(notifyReimbursementReminder).toHaveBeenCalledWith("payer", "Requester", 130, expect.any(Number));
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
    expect(enqueueDailySummary).not.toHaveBeenCalled();
  });

  it("rejects authenticated test mode without running queries or sending notifications", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret", NOTIFICATIONS_ENABLED: "true" };

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts?test=1", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "dry-run not supported" });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.query.transactions.findMany).not.toHaveBeenCalled();
    expect(db.query.monthly_settings.findFirst).not.toHaveBeenCalled();
    expect(db.query.split_sessions.findMany).not.toHaveBeenCalled();
    expect(db.query.splits.findFirst).not.toHaveBeenCalled();
    expect(getMonthSummary).not.toHaveBeenCalled();
    expect(getCategoryBreakdown).not.toHaveBeenCalled();
    expect(buildDailyAlert).not.toHaveBeenCalled();
    expect(resolveAuthorizedTelegramGroup).not.toHaveBeenCalled();
    expect(enqueueDailySummary).not.toHaveBeenCalled();
    expect(notifyReimbursementReminder).not.toHaveBeenCalled();
  });

  function setupDailyProcessing(users: Array<Record<string, unknown>>) {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret", NOTIFICATIONS_ENABLED: "true", TELEGRAM_CHAT_ID: "global-chat" };
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
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "USD_ARS" });
    (getAccountingMonthProjection as jest.Mock).mockResolvedValue(null);
    (getCategoryBreakdown as jest.Mock).mockResolvedValue([]);
    (buildDailyAlert as jest.Mock).mockReturnValue({ shouldSend: true, message: "daily" });
  }

  it("does not read financial details or send a summary without the recipient's opt-in", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: "tg-u1", active_telegram_group_id: "g1" }]);
    (hasProactiveConsent as jest.Mock).mockResolvedValue(false);
    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(await response.json()).toMatchObject({ results: [{ userId: "u1", sent: false, reason: "not_opted_in" }] });
    expect(hasProactiveConsent).toHaveBeenCalledWith("u1", "dailySummary");
    expect(resolveAuthorizedTelegramGroup).not.toHaveBeenCalled();
    expect(getMonthSummary).not.toHaveBeenCalled();
    expect(enqueueDailySummary).not.toHaveBeenCalled();
  });

  it("keeps A's opt-in from authorizing an alert to B", async () => {
    setupDailyProcessing([
      { id: "user-A", telegram_user_id: "telegram-A", active_telegram_group_id: "group-A" },
      { id: "user-B", telegram_user_id: "telegram-B", active_telegram_group_id: "group-B" },
    ]);
    (hasProactiveConsent as jest.Mock).mockImplementation(async (userId: string) => userId === "user-A");

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(await response.json()).toMatchObject({ results: [
      { userId: "user-A", sent: false, reason: "queued" },
      { userId: "user-B", sent: false, reason: "not_opted_in" },
    ] });
    expect(enqueueDailySummary).toHaveBeenCalledTimes(1);
    expect(enqueueDailySummary).toHaveBeenCalledWith(expect.objectContaining({ chatId: "telegram-A", message: "daily", groupId: "resolved-group" }));
    expect(resolveAuthorizedTelegramGroup).toHaveBeenCalledTimes(1);
  });

  it("limits the beta canary to the configured user and group without scanning reimbursements", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      setupDailyProcessing([
        { id: "user-A", telegram_user_id: "telegram-A", active_telegram_group_id: "group-A" },
        { id: "user-B", telegram_user_id: "telegram-B", active_telegram_group_id: "group-B" },
      ]);
      process.env = {
        ...process.env,
        NOTIFICATIONS_ENABLED: "false",
        DAILY_SUMMARY_CANARY_ENABLED: "true",
        DAILY_SUMMARY_CANARY_USER_ID: "user-A",
        DAILY_SUMMARY_CANARY_GROUP_ID: "resolved-group",
        HERMES_BETA_ISOLATION_ASSERT: "true",
        NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
        TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
        TELEGRAM_BOT_ID: "8739389202",
      };

      const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
        headers: { authorization: "Bearer cron-secret" },
      }));

      expect(await response.json()).toMatchObject({ results: [
        { userId: "user-A", reason: "queued" },
        { userId: "user-B", reason: "outside_canary" },
      ] });
      expect(enqueueDailySummary).toHaveBeenCalledTimes(1);
      expect(notifyReimbursementReminder).not.toHaveBeenCalled();
      const receipt = String(info.mock.calls[0]?.[0]);
      expect(JSON.parse(receipt)).toEqual({
        event: "beta_daily_summary_canary_cron",
        argentinaDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        outcome: "queued",
      });
      expect(receipt).not.toContain("user-A");
      expect(receipt).not.toContain("telegram-A");
      expect(receipt).not.toContain("resolved-group");
    } finally {
      info.mockRestore();
    }
  });

  it("does not prepare a daily canary if its active group changed", async () => {
    setupDailyProcessing([{ id: "user-A", telegram_user_id: "telegram-A", active_telegram_group_id: "group-A" }]);
    process.env = {
      ...process.env,
      NOTIFICATIONS_ENABLED: "false",
      DAILY_SUMMARY_CANARY_ENABLED: "true",
      DAILY_SUMMARY_CANARY_USER_ID: "user-A",
      DAILY_SUMMARY_CANARY_GROUP_ID: "old-group",
      HERMES_BETA_ISOLATION_ASSERT: "true",
      NEXT_PUBLIC_APP_URL: "https://hermes-finantial-tracker-z2.vercel.app",
      TURSO_DATABASE_URL: "libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io",
      TELEGRAM_BOT_ID: "8739389202",
    };

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(await response.json()).toMatchObject({ results: [{ userId: "user-A", reason: "outside_canary" }] });
    expect(getMonthSummary).not.toHaveBeenCalled();
    expect(enqueueDailySummary).not.toHaveBeenCalled();
  });

  it("does not remind a payer who did not opt in even when membership is current", async () => {
    process.env = { ...originalEnv, CRON_SECRET: "cron-secret", NOTIFICATIONS_ENABLED: "true" };
    (db.select as jest.Mock)
      .mockReturnValueOnce({ from: jest.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{
        id: "r1", transactionId: "tx1", payerId: "payer", requesterId: "requester",
        amount: 100, createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
      }]) })) });
    (hasProactiveConsent as jest.Mock).mockResolvedValue(false);
    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(response.status).toBe(200);
    expect(hasProactiveConsent).toHaveBeenCalledWith("payer", "reimbursements");
    expect(getGroupMembership).not.toHaveBeenCalled();
    expect(notifyReimbursementReminder).not.toHaveBeenCalled();
  });

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
    expect(enqueueDailySummary).toHaveBeenNthCalledWith(1, expect.objectContaining({ chatId: "tg-u1", message: "daily" }));
    expect(enqueueDailySummary).toHaveBeenNthCalledWith(2, expect.objectContaining({ chatId: "tg-u2", message: "daily" }));
    expect(enqueueDailySummary).not.toHaveBeenCalledWith(expect.objectContaining({ chatId: "global-chat" }));
    expect(enqueueDailySummary).not.toHaveBeenCalledWith(expect.objectContaining({ chatId: "chat-u1" }));
    expect(enqueueDailySummary).not.toHaveBeenCalledWith(expect.objectContaining({ chatId: "chat-u2" }));
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

    expect(enqueueDailySummary).toHaveBeenCalledWith(expect.objectContaining({ chatId: "tg-u1", message: "daily" }));
    expect(enqueueDailySummary).not.toHaveBeenCalledWith(expect.objectContaining({ chatId: "global-chat" }));
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
    expect(enqueueDailySummary).not.toHaveBeenCalled();
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
    expect(enqueueDailySummary).not.toHaveBeenCalled();
  });

  it("builds an ARS-only alert from the ARS projection and configured yellow threshold", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: "tg-u1", active_telegram_group_id: "g1" }]);
    process.env.ACT05_ARS_MODE_ENABLED = "true";
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS", saving_goal_yellow_ars: 70000 });
    (getAccountingMonthProjection as jest.Mock).mockResolvedValue({ mode: "ARS_ARS", accountingCurrency: "ARS", effectiveIncome: 100000, totalExpenses: 25000, projectedSavings: 75000, savingGoal: 80000 });

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(getMonthSummary).not.toHaveBeenCalled();
    expect(buildDailyAlert).toHaveBeenCalledWith(expect.objectContaining({
      accountingCurrency: "ARS", income: 100000, totalSpent: 25000,
      projectedSavings: 75000, savingGoal: 80000, status: "YELLOW",
    }));
  });

  it("does not send an ARS-only alert while the feature flag is off", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: "tg-u1", active_telegram_group_id: "g1" }]);
    delete process.env.ACT05_ARS_MODE_ENABLED;
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({ currency_mode: "ARS_ARS", saving_goal_yellow_ars: 70000 });
    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(await response.json()).toMatchObject({ results: [{ sent: false, reason: "summary_unavailable" }] });
    expect(getAccountingMonthProjection).not.toHaveBeenCalled();
    expect(buildDailyAlert).not.toHaveBeenCalled();
  });

  it("does not send to a stale group chat when the user has no linked private Telegram ID", async () => {
    setupDailyProcessing([{ id: "u1", telegram_user_id: null, active_telegram_group_id: "g1" }]);
    (db.query.bot_messages.findFirst as jest.Mock).mockResolvedValue({ telegram_chat_id: "stale-group-chat" });

    const response = await GET(new NextRequest("http://localhost/api/cron/daily-alerts", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(await response.json()).toMatchObject({ results: [{ userId: "u1", sent: false, reason: "no_chat_id" }] });
    expect(enqueueDailySummary).not.toHaveBeenCalled();
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
    expect(enqueueDailySummary).not.toHaveBeenCalled();
  });
});
