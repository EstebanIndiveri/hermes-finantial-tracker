import { calculateGlobalBalances } from "../global-balances";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      split_sessions: {
        findMany: jest.fn(),
      },
      splits: {
        findMany: jest.fn(),
      },
    },
    select: jest.fn(),
  },
}));

function mockSelectResolvedValue(value: unknown) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(value),
    }),
  };
}

function mockMemberSessions(value: unknown) {
  return {
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(value),
      }),
    }),
  };
}

describe("calculateGlobalBalances", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("aggregates balances across multiple sessions for the same partner", async () => {
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([
      { id: "session-1", name: "Trip", owner_user_id: "user-1" },
    ]);
    (db.query.splits.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: "split-1", session_id: "session-1", status: "active" }])
      .mockResolvedValueOnce([{ id: "split-2", session_id: "session-2", status: "active" }]);

    const selectMock = db.select as jest.Mock;
    selectMock
      .mockReturnValueOnce(mockMemberSessions([{ id: "session-2", name: "Dinner" }]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_paid: 100 }, { user_id: "user-2", amount_paid: 0 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_owed: 50 }, { user_id: "user-2", amount_owed: 50 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_paid: 0 }, { user_id: "user-2", amount_paid: 90 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_owed: 45 }, { user_id: "user-2", amount_owed: 45 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([]));

    const result = await calculateGlobalBalances("user-1");

    expect(result.partnerBalances).toHaveLength(1);
    expect(result.partnerBalances[0]).toMatchObject({
      partner: { userId: "user-2" },
      net: 5,
    });
    expect(result.partnerBalances[0].sessionBreakdown).toEqual([
      { sessionId: "session-2", sessionName: "Dinner", net: -45 },
      { sessionId: "session-1", sessionName: "Trip", net: 50 },
    ]);
    expect(result.theyOwe).toEqual([{ from: { userId: "user-2" }, to: { userId: "user-1" }, amount: 5, sessionIds: ["session-2", "session-1"] }]);
    expect(result.youOwe).toEqual([]);
    expect(result.totalTheyOwe).toBe(5);
    expect(result.totalYouOwe).toBe(0);
  });

  it("returns debts when the user owes one partner", async () => {
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([
    ]);
    (db.query.splits.findMany as jest.Mock).mockResolvedValue([{ id: "split-1", session_id: "session-1", status: "active" }]);

    const selectMock = db.select as jest.Mock;
    selectMock
      .mockReturnValueOnce(mockMemberSessions([{ id: "session-1", name: "Lunch" }]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-2", amount_paid: 100 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_owed: 50 }, { user_id: "user-2", amount_owed: 50 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([]));

    const result = await calculateGlobalBalances("user-1");

    expect(result.partnerBalances).toEqual([
      {
        partner: { userId: "user-2" },
        partnerName: undefined,
        net: -50,
        sessionBreakdown: [{ sessionId: "session-1", sessionName: "Lunch", net: -50 }],
      },
    ]);
    expect(result.youOwe).toEqual([{ from: { userId: "user-1" }, to: { userId: "user-2" }, amount: 50, sessionIds: ["session-1"] }]);
    expect(result.theyOwe).toEqual([]);
    expect(result.totalYouOwe).toBe(50);
    expect(result.totalTheyOwe).toBe(0);
  });

  it("returns debts when one partner owes the user", async () => {
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([
      { id: "session-1", name: "Taxi", owner_user_id: "user-1" },
    ]);
    (db.query.splits.findMany as jest.Mock).mockResolvedValue([{ id: "split-1", session_id: "session-1", status: "active" }]);

    const selectMock = db.select as jest.Mock;
    selectMock
      .mockReturnValueOnce(mockMemberSessions([]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_paid: 80 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_owed: 40 }, { user_id: "user-2", amount_owed: 40 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([]));

    const result = await calculateGlobalBalances("user-1");

    expect(result.partnerBalances).toEqual([
      {
        partner: { userId: "user-2" },
        partnerName: undefined,
        net: 40,
        sessionBreakdown: [{ sessionId: "session-1", sessionName: "Taxi", net: 40 }],
      },
    ]);
    expect(result.theyOwe).toEqual([{ from: { userId: "user-2" }, to: { userId: "user-1" }, amount: 40, sessionIds: ["session-1"] }]);
    expect(result.youOwe).toEqual([]);
    expect(result.totalTheyOwe).toBe(40);
    expect(result.totalYouOwe).toBe(0);
  });

  it("separates mixed partners where user owes one and is owed by another", async () => {
    (db.query.split_sessions.findMany as jest.Mock).mockResolvedValue([
      { id: "session-1", name: "Movie", owner_user_id: "user-1" },
    ]);
    (db.query.splits.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: "split-1", session_id: "session-1", status: "active" }])
      .mockResolvedValueOnce([{ id: "split-2", session_id: "session-2", status: "active" }]);

    const selectMock = db.select as jest.Mock;
    selectMock
      .mockReturnValueOnce(mockMemberSessions([{ id: "session-2", name: "Coffee" }]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-2", amount_paid: 60 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_owed: 30 }, { user_id: "user-2", amount_owed: 30 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_paid: 120 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([{ user_id: "user-1", amount_owed: 40 }, { user_id: "user-3", amount_owed: 80 }]))
      .mockReturnValueOnce(mockSelectResolvedValue([]));

    const result = await calculateGlobalBalances("user-1");

    expect(result.partnerBalances).toEqual([
      {
        partner: { userId: "user-2" },
        partnerName: undefined,
        net: -30,
        sessionBreakdown: [{ sessionId: "session-1", sessionName: "Movie", net: -30 }],
      },
      {
        partner: { userId: "user-3" },
        partnerName: undefined,
        net: 80,
        sessionBreakdown: [{ sessionId: "session-2", sessionName: "Coffee", net: 80 }],
      },
    ]);
    expect(result.youOwe).toEqual([{ from: { userId: "user-1" }, to: { userId: "user-2" }, amount: 30, sessionIds: ["session-1"] }]);
    expect(result.theyOwe).toEqual([{ from: { userId: "user-3" }, to: { userId: "user-1" }, amount: 80, sessionIds: ["session-2"] }]);
    expect(result.totalYouOwe).toBe(30);
    expect(result.totalTheyOwe).toBe(80);
  });
});
