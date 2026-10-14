import { db } from "../client";
import { recurringExecutions, recurringExpenses, monthly_settings, categories, group_members, users } from "../schema";
import { confirmExecution, getOverdueExecutions, getPendingExecutions, getUpcomingExecutions, getUserRecurringExpenses, skipExecution } from "../recurring-queries";
import { and, eq } from "drizzle-orm";
import { createTelegramOperationContext, createTelegramOperationIdentity } from "@/lib/telegram/operation-context";
import { runTelegramOperation } from "@/lib/telegram/financial-operation";

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    and: jest.fn(actual.and),
    eq: jest.fn(actual.eq),
  };
});

const mockLimit = jest.fn();
const mockOrderBy = jest.fn().mockResolvedValue([]);
const mockWhere = jest.fn(() => ({ limit: mockLimit, orderBy: mockOrderBy }));
const mockInnerJoin = jest.fn(() => ({ where: mockWhere, innerJoin: mockInnerJoin, leftJoin: mockLeftJoin }));
const mockLeftJoin = jest.fn(() => ({ where: mockWhere, innerJoin: mockInnerJoin, leftJoin: mockLeftJoin }));
const mockFrom = jest.fn(() => ({ innerJoin: mockInnerJoin, leftJoin: mockLeftJoin, where: mockWhere }));
const mockInsertValues = jest.fn();
const mockUpdateReturning = jest.fn().mockResolvedValue([{ id: "exec-a" }]);
const mockUpdateWhere = jest.fn(() => ({ returning: mockUpdateReturning }));
const mockUpdateSet = jest.fn(() => ({ where: mockUpdateWhere }));

jest.mock("../client", () => ({
  db: {
    select: jest.fn(() => ({ from: mockFrom })),
    insert: jest.fn(() => ({ values: mockInsertValues })),
    update: jest.fn(() => ({ set: mockUpdateSet })),
    transaction: jest.fn(),
  },
}));

jest.mock("@/lib/telegram/financial-operation", () => ({
  runTelegramOperation: jest.fn(),
}));

const mockAnd = and as jest.MockedFunction<typeof and>;
const mockEq = eq as jest.MockedFunction<typeof eq>;
const mockDb = db as jest.Mocked<typeof db>;
const mockRunTelegramOperation = runTelegramOperation as jest.Mock;

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
  expect(mockEq).toHaveBeenCalledWith(group_members.group_id, recurringExpenses.groupId);
  expect(mockEq).toHaveBeenCalledWith(group_members.user_id, recurringExpenses.userId);
  expect(mockInnerJoin).toHaveBeenCalledWith(group_members, expect.anything());
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
    mockOrderBy.mockResolvedValue([]);
    mockUpdateReturning.mockResolvedValue([{ id: "exec-a" }]);
    (mockDb.transaction as jest.Mock).mockImplementation(
      async (work: (transaction: typeof db) => Promise<unknown>) => work(db),
    );
  });

  it("filters recurring definitions and pending reminders by current group membership", async () => {
    await expect(getUserRecurringExpenses("user-a", { activeOnly: true })).resolves.toEqual([]);
    await expect(getPendingExecutions("user-a", "2026-09")).resolves.toEqual([]);

    const memberJoins = mockInnerJoin.mock.calls.filter(([table]) => table === group_members);
    expect(memberJoins).toHaveLength(2);
    expect(mockEq).toHaveBeenCalledWith(group_members.group_id, recurringExpenses.groupId);
    expect(mockEq).toHaveBeenCalledWith(group_members.user_id, recurringExpenses.userId);
  });

  it("keeps reminder candidates group-scoped and requires the active Telegram group", async () => {
    const base = {
      recurringExpenseId: "rec-a",
      scheduledDate: "2026-09-15",
      status: "pending",
      amountArs: 100,
      createdAt: 1,
      recurringName: "Internet",
      recurringAmount: 100,
      recurringMerchant: null,
      recurringCategoryId: null,
      recurringUserId: "user-a",
      categoryName: null,
      categoryEmoji: null,
      categorySlug: null,
      userTelegramId: "telegram-a",
    };
    const candidates = [
      { ...base, execId: "exec-a", recurringGroupId: "group-a" },
      { ...base, execId: "exec-b", recurringGroupId: "group-b" },
    ];
    mockWhere.mockResolvedValueOnce(candidates).mockResolvedValueOnce(candidates);

    const upcoming = await getUpcomingExecutions(3);
    const overdue = await getOverdueExecutions();

    for (const result of [upcoming, overdue]) {
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: "user-a", groupId: "group-a", executions: [expect.objectContaining({ id: "exec-a" })] }),
        expect.objectContaining({ userId: "user-a", groupId: "group-b", executions: [expect.objectContaining({ id: "exec-b" })] }),
      ]));
    }
    expect(mockEq).toHaveBeenCalledWith(users.active_telegram_group_id, recurringExpenses.groupId);
    expect(mockEq).toHaveBeenCalledWith(group_members.group_id, recurringExpenses.groupId);
    expect(mockEq).toHaveBeenCalledWith(group_members.user_id, recurringExpenses.userId);
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
      .mockResolvedValueOnce([authorizedRecurring])
      .mockResolvedValueOnce([{ userId: "user-a" }])
      .mockResolvedValueOnce([{ currency_mode: "USD_ARS", exchange_rate: 1000 }])
      .mockResolvedValueOnce([{ id: "cat-a" }]);

    const result = await confirmExecution("exec-a", "user-a", amount);

    expect(result).toEqual({ success: true, transactionId: expect.any(String) });
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-a",
      group_id: "group-a",
      amount_ars: expectedAmount,
      amount_usd: Number((expectedAmount / 1000).toFixed(2)),
      exchange_rate_snapshot: 1000,
      currency_mode: "USD_ARS",
    }));
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: result.transactionId,
      status: "confirmed",
      amountArs: expectedAmount,
    }));
    expect(mockUpdateWhere).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith(recurringExecutions.status, "pending");
  });

  it("uses group settings when the member is not the settings owner", async () => {
    mockLimit
      .mockResolvedValueOnce([{ ...authorizedExecution, ownerUserId: "member-a" }])
      .mockResolvedValueOnce([{ ...authorizedRecurring, userId: "member-a" }])
      .mockResolvedValueOnce([{ userId: "member-a" }])
      .mockResolvedValueOnce([{ currency_mode: "USD_ARS", exchange_rate: 1250 }])
      .mockResolvedValueOnce([{ id: "cat-a" }]);

    const result = await confirmExecution("exec-a", "member-a");

    expect(result.success).toBe(true);
    expect(mockEq).toHaveBeenCalledWith(monthly_settings.group_id, "group-a");
    expect(mockEq).toHaveBeenCalledWith(monthly_settings.month, "2026-09");
    expect(mockEq).not.toHaveBeenCalledWith(monthly_settings.user_id, "member-a");
    expect(mockEq).toHaveBeenCalledWith(categories.group_id, "group-a");
  });

  it("rejects a recurring confirmation without a group", async () => {
    mockLimit
      .mockResolvedValueOnce([authorizedExecution])
      .mockResolvedValueOnce([{ ...authorizedRecurring, groupId: null }]);

    await expect(confirmExecution("exec-a", "user-a")).rejects.toThrow("sin grupo");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("rejects a former member before any financial write", async () => {
    mockLimit
      .mockResolvedValueOnce([authorizedExecution])
      .mockResolvedValueOnce([authorizedRecurring])
      .mockResolvedValueOnce([]);

    await expect(confirmExecution("exec-a", "user-a")).rejects.toThrow("ya no pertenece");
    expect(mockEq).toHaveBeenCalledWith(group_members.group_id, "group-a");
    expect(mockEq).toHaveBeenCalledWith(group_members.user_id, "user-a");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid amount before writing a transaction", async () => {
    mockLimit
      .mockResolvedValueOnce([authorizedExecution])
      .mockResolvedValueOnce([authorizedRecurring]);

    await expect(confirmExecution("exec-a", "user-a", Number.NaN)).rejects.toThrow("importe");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("rejects a legacy confirmation when the pending execution claim loses", async () => {
    mockLimit
      .mockResolvedValueOnce([authorizedExecution])
      .mockResolvedValueOnce([authorizedRecurring])
      .mockResolvedValueOnce([{ userId: "user-a" }])
      .mockResolvedValueOnce([{ currency_mode: "USD_ARS", exchange_rate: 1000 }])
      .mockResolvedValueOnce([{ id: "cat-a" }]);
    mockUpdateReturning.mockResolvedValueOnce([]);

    await expect(confirmExecution("exec-a", "user-a")).resolves.toEqual({
      success: false,
      error: "Esta ejecución ya fue procesada",
    });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockUpdateReturning).toHaveBeenCalledTimes(1);
  });

  it("atomically writes a context-aware confirmation, operation id, and fallback delivery", async () => {
    const txInserts: Array<{ table: unknown; values: unknown }> = [];
    const txUpdates: unknown[] = [];
    const txSelectBuilder: Record<"from" | "innerJoin" | "leftJoin" | "where" | "limit", jest.Mock> = {
      from: jest.fn(() => txSelectBuilder),
      innerJoin: jest.fn(() => txSelectBuilder),
      leftJoin: jest.fn(() => txSelectBuilder),
      where: jest.fn(() => txSelectBuilder),
      limit: jest.fn()
        .mockResolvedValueOnce([authorizedExecution])
        .mockResolvedValueOnce([authorizedRecurring])
        .mockResolvedValueOnce([{ userId: "user-a" }])
        .mockResolvedValueOnce([{ currency_mode: "USD_ARS", exchange_rate: 1000 }])
        .mockResolvedValueOnce([{ id: "cat-a" }]),
    };
    const tx = {
      select: jest.fn(() => txSelectBuilder),
      insert: jest.fn((table: unknown) => ({
        values: jest.fn(async (values: unknown) => {
          txInserts.push({ table, values });
        }),
      })),
      update: jest.fn(() => ({
        set: jest.fn((values: unknown) => {
          txUpdates.push(values);
          return {
            where: jest.fn(() => ({
              returning: jest.fn().mockResolvedValue([{ id: "exec-a" }]),
            })),
          };
        }),
      })),
    };
    mockRunTelegramOperation.mockImplementationOnce(async (
      _runner: unknown,
      input: { identity: { operationId: string }; operationKind: string },
      writer: (transaction: typeof tx) => Promise<{ resourceType: string; resourceId: string; result: unknown }>,
    ) => {
      expect(input.operationKind).toBe("recurring.confirm:exec-a");
      return {
        kind: "committed",
        operationId: input.identity.operationId,
        ...(await writer(tx)),
        reused: false,
      };
    });

    const context = createTelegramOperationContext({
      botId: "bot-1",
      updateId: "update-1",
      chatId: "chat-1",
      callbackMessageId: 22,
      action: "callback",
    });
    const expectedOperationId = createTelegramOperationIdentity({
      ...context,
      action: "recurring.confirm",
      suffix: "exec-a",
    }).operationId;

    const result = await confirmExecution("exec-a", "user-a", 12500, context);

    expect(result).toEqual({
      success: true,
      transactionId: expect.any(String),
      deliveryOperationId: expectedOperationId,
      deliveryKey: expect.stringMatching(/^tgdel_v1_/),
    });
    expect(txInserts[0].values).toEqual(expect.objectContaining({
      operation_id: expectedOperationId,
      user_id: "user-a",
      amount_ars: 12500,
    }));
    expect(txInserts[1].values).toEqual(expect.objectContaining({
      operation_id: expectedOperationId,
      action: "edit_message",
      message_id: 22,
    }));
    expect(txUpdates[0]).toEqual(expect.objectContaining({ status: "confirmed", amountArs: 12500 }));
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
