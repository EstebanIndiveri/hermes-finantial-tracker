import { db } from "../client";
import { recurringExecutions, recurringExpenses } from "../schema";
import { confirmExecution, skipExecution } from "../recurring-queries";
import { and, eq } from "drizzle-orm";

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    and: jest.fn(actual.and),
    eq: jest.fn(actual.eq),
  };
});

const mockLimit = jest.fn();
const mockWhere = jest.fn(() => ({ limit: mockLimit }));
const mockInnerJoin = jest.fn(() => ({ where: mockWhere }));
const mockLeftJoin = jest.fn(() => ({ where: mockWhere }));
const mockFrom = jest.fn(() => ({ innerJoin: mockInnerJoin, leftJoin: mockLeftJoin, where: mockWhere }));
const mockInsertValues = jest.fn();
const mockUpdateWhere = jest.fn();
const mockUpdateSet = jest.fn(() => ({ where: mockUpdateWhere }));

jest.mock("../client", () => ({
  db: {
    select: jest.fn(() => ({ from: mockFrom })),
    insert: jest.fn(() => ({ values: mockInsertValues })),
    update: jest.fn(() => ({ set: mockUpdateSet })),
  },
}));

const mockAnd = and as jest.MockedFunction<typeof and>;
const mockEq = eq as jest.MockedFunction<typeof eq>;
const mockDb = db as jest.Mocked<typeof db>;

function expectActorScopedLookup(executionId: string, actorUserId: string): void {
  expect(mockInnerJoin).toHaveBeenCalled();
  expect(mockEq).toHaveBeenCalledWith(
    recurringExecutions.recurringExpenseId,
    recurringExpenses.id,
  );
  expect(mockEq).toHaveBeenCalledWith(recurringExecutions.id, executionId);
  expect(mockEq).toHaveBeenCalledWith(recurringExpenses.userId, actorUserId);

  const idCall = mockEq.mock.calls.findIndex(
    ([column, value]) => column === recurringExecutions.id && value === executionId,
  );
  const actorCall = mockEq.mock.calls.findIndex(
    ([column, value]) => column === recurringExpenses.userId && value === actorUserId,
  );
  expect(idCall).toBeGreaterThanOrEqual(0);
  expect(actorCall).toBeGreaterThanOrEqual(0);

  const idPredicate = mockEq.mock.results[idCall].value;
  const actorPredicate = mockEq.mock.results[actorCall].value;
  expect(mockAnd).toHaveBeenCalledWith(idPredicate, actorPredicate);
  const guardedPredicate = mockAnd.mock.results.find(
    (_, index) => {
      const args = mockAnd.mock.calls[index];
      return args[0] === idPredicate && args[1] === actorPredicate;
    },
  )?.value;
  expect(guardedPredicate).toBeDefined();
  expect(mockWhere).toHaveBeenCalledWith(guardedPredicate);

  const joinCall = mockEq.mock.calls.findIndex(
    ([left, right]) => left === recurringExecutions.recurringExpenseId && right === recurringExpenses.id,
  );
  expect(joinCall).toBeGreaterThanOrEqual(0);
  expect(mockInnerJoin).toHaveBeenCalledWith(
    recurringExpenses,
    mockEq.mock.results[joinCall].value,
  );
}

const authorizedExecution = {
  id: "exec-a",
  recurringExpenseId: "rec-a",
  transactionId: null,
  scheduledDate: "2026-09-15",
  executedAt: null,
  status: "pending",
  amountArs: 10000,
  createdAt: 1,
  ownerUserId: "user-a",
};

const authorizedRecurring = {
  id: "rec-a",
  userId: "user-a",
  groupId: "group-a",
  name: "Internet",
  amountArs: 10000,
  categoryId: "cat-a",
  merchant: null,
  frequency: "monthly",
  dayOfMonth: 15,
  isActive: true,
  autoConfirm: false,
  notes: null,
  createdAt: 1,
  updatedAt: 1,
  categoryName: "Servicios",
  categoryEmoji: "🌐",
  categorySlug: "servicios",
};

describe("recurring execution authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLimit.mockResolvedValue([]);
  });

  it("scopes confirmation lookup to both execution ID and actor", async () => {
    await expect(confirmExecution("exec-b", "user-a", 12500)).resolves.toEqual({
      success: false,
      error: "Ejecución no encontrada",
    });

    expectActorScopedLookup("exec-b", "user-a");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("scopes skip lookup to both execution ID and actor", async () => {
    await expect(skipExecution("exec-b", "user-a")).resolves.toEqual({
      success: false,
      error: "Ejecución no encontrada",
    });

    expectActorScopedLookup("exec-b", "user-a");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("returns the same result for another actor's execution and a missing ID", async () => {
    mockLimit
      .mockResolvedValueOnce([
        {
          id: "exec-b",
          recurringExpenseId: "rec-b",
          status: "pending",
          ownerUserId: "user-b",
        },
      ])
      .mockResolvedValueOnce([]);

    const foreignResult = await skipExecution("exec-b", "user-a");
    const missingResult = await skipExecution("exec-missing", "user-a");

    expect(foreignResult).toEqual({ success: false, error: "Ejecución no encontrada" });
    expect(missingResult).toEqual(foreignResult);
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 10000],
    [12500, 12500],
  ])("confirms the actor's own execution with amount %p", async (amount, expectedAmount) => {
    mockLimit
      .mockResolvedValueOnce([authorizedExecution])
      .mockResolvedValueOnce([authorizedRecurring]);

    const result = await confirmExecution("exec-a", "user-a", amount);

    expect(result).toEqual({ success: true, transactionId: expect.any(String) });
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-a",
      group_id: "group-a",
      amount_ars: expectedAmount,
    }));
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: result.transactionId,
      status: "confirmed",
      amountArs: expectedAmount,
    }));
    expect(mockUpdateWhere).toHaveBeenCalled();
  });

  it("skips the actor's own pending execution", async () => {
    mockLimit.mockResolvedValueOnce([authorizedExecution]);

    await expect(skipExecution("exec-a", "user-a")).resolves.toEqual({ success: true });

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped" }));
    expect(mockUpdateWhere).toHaveBeenCalled();
  });

  it("does not rewrite the actor's own execution after it was processed", async () => {
    mockLimit.mockResolvedValueOnce([{ ...authorizedExecution, status: "confirmed" }]);

    await expect(skipExecution("exec-a", "user-a")).resolves.toEqual({
      success: false,
      error: "Esta ejecución ya fue procesada",
    });

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
