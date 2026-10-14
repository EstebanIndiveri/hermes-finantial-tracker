import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { recurringExecutions, recurringExpenses, users } from "@/lib/db/schema";
import { getRecurringReminderScope } from "../recurring-reminder-canary";
import { materializeCanaryUpcomingExecutions } from "../recurring-canary-materialization";

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: jest.fn(actual.eq), and: jest.fn(actual.and) };
});
const mockWhere = jest.fn();
const mockJoin = jest.fn(() => ({ innerJoin: mockJoin, where: mockWhere }));
const mockInsertReturning = jest.fn();
const mockInsertConflict = jest.fn(() => ({ returning: mockInsertReturning }));
const mockInsertValues = jest.fn(() => ({ onConflictDoNothing: mockInsertConflict }));
jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(() => ({ from: jest.fn(() => ({ innerJoin: mockJoin })) })),
    insert: jest.fn(() => ({ values: mockInsertValues })),
  },
}));
jest.mock("../recurring-reminder-canary", () => ({ getRecurringReminderScope: jest.fn() }));

const mockScope = getRecurringReminderScope as jest.Mock;
const mockDb = db as jest.Mocked<typeof db>;
const mockEq = eq as jest.MockedFunction<typeof eq>;
const mockAnd = and as jest.MockedFunction<typeof and>;

describe("canary pending execution materialization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScope.mockReturnValue({ mode: "canary", userId: "qa", groupId: "personal" });
    mockWhere.mockResolvedValue([{ id: "netflix", amountArs: 3000 }]);
    mockInsertReturning.mockResolvedValue([{ id: "execution-1" }]);
  });

  it("does not touch the database when canary is off or the identity differs", async () => {
    mockScope.mockReturnValueOnce({ mode: "off" });
    await expect(materializeCanaryUpcomingExecutions("qa", "personal", "2026-10-18")).resolves.toBe(0);
    await expect(materializeCanaryUpcomingExecutions("someone-else", "personal", "2026-10-18")).resolves.toBe(0);
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("creates only a pending Netflix occurrence due on the target day", async () => {
    await expect(materializeCanaryUpcomingExecutions("qa", "personal", "2026-10-18")).resolves.toBe(1);
    expect(mockEq).toHaveBeenCalledWith(recurringExpenses.userId, "qa");
    expect(mockEq).toHaveBeenCalledWith(recurringExpenses.groupId, "personal");
    expect(mockEq).toHaveBeenCalledWith(users.active_telegram_group_id, "personal");
    expect(mockEq).toHaveBeenCalledWith(recurringExpenses.isActive, true);
    expect(mockEq).toHaveBeenCalledWith(recurringExpenses.autoConfirm, false);
    expect(mockEq).toHaveBeenCalledWith(recurringExpenses.frequency, "monthly");
    expect(mockEq).toHaveBeenCalledWith(recurringExpenses.dayOfMonth, 18);
    expect(mockAnd).toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalledWith(recurringExecutions);
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      recurringExpenseId: "netflix", scheduledDate: "2026-10-18", status: "pending",
      transactionId: null, executedAt: null, amountArs: 3000,
    }));
    expect(mockInsertConflict).toHaveBeenCalledWith({
      target: [recurringExecutions.recurringExpenseId, recurringExecutions.scheduledDate],
    });
  });

  it("reports no new row when the unique occurrence already exists", async () => {
    mockInsertReturning.mockResolvedValue([]);
    await expect(materializeCanaryUpcomingExecutions("qa", "personal", "2026-10-18")).resolves.toBe(0);
  });

  it("rejects an invalid date before any database access", async () => {
    await expect(materializeCanaryUpcomingExecutions("qa", "personal", "2026-02-30")).rejects.toThrow("Invalid Argentina calendar date");
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
