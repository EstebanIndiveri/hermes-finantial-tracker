import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge, getExecutionStatus } from "@/components/ui/status-badge";
import { RecurringList } from "@/components/recurring/recurring-list";

const mockStateQueue: unknown[] = [];
const mockSetState = jest.fn();

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");

  return {
    ...actual,
    useState: (initial: unknown) =>
      mockStateQueue.length > 0 ? [mockStateQueue.shift(), mockSetState] : actual.useState(initial),
  };
});

jest.mock("@/lib/utils/dates", () => ({
  getArgentinaDate: jest.fn(),
}));

const { getArgentinaDate } = jest.requireMock("@/lib/utils/dates") as {
  getArgentinaDate: jest.Mock;
};

describe("getExecutionStatus", () => {
  afterEach(() => {
    getArgentinaDate.mockReset();
  });

  it("returns paid for executed executions", () => {
    expect(getExecutionStatus("2026-08-20", "executed")).toEqual({ status: "paid" });
  });

  it("returns due today for executions scheduled today", () => {
    getArgentinaDate.mockReturnValue(new Date("2026-08-23T12:00:00.000Z"));

    expect(getExecutionStatus("2026-08-23", "pending")).toEqual({ status: "due_today" });
  });

  it("returns overdue with day count for past pending executions", () => {
    getArgentinaDate.mockReturnValue(new Date("2026-08-23T12:00:00.000Z"));

    expect(getExecutionStatus("2026-08-20", "pending")).toEqual({
      status: "overdue",
      daysOverdue: 3,
    });
  });
});

describe("StatusBadge", () => {
  it("renders overdue label with singular day count", () => {
    const markup = renderToStaticMarkup(<StatusBadge status="overdue" daysOverdue={1} />);

    expect(markup).toContain("🚨");
    expect(markup).toContain("Vencido (1 día)");
  });
});

describe("RecurringList", () => {
  it("renders the loading state copy", () => {
    const markup = renderToStaticMarkup(<RecurringList />);

    expect(markup).toContain("Cargando gastos recurrentes...");
  });

  it("renders pending, paid, and edit controls for loaded recurring data", () => {
    getArgentinaDate.mockReturnValue(new Date("2026-08-23T12:00:00.000Z"));
    mockStateQueue.push(
      [
        {
          id: "expense-1",
          userId: "user-1",
          groupId: null,
          name: "Alquiler",
          amountArs: 1000,
          categoryId: "housing",
          merchant: null,
          frequency: "monthly",
          dayOfMonth: 1,
          isActive: true,
          autoConfirm: false,
          notes: null,
          createdAt: 0,
          updatedAt: 0,
          category: { id: "housing", name: "Vivienda", emoji: "🏠", slug: "vivienda" },
        },
      ],
      [
        {
          id: "pending-1",
          recurringExpenseId: "expense-1",
          transactionId: null,
          scheduledDate: "2026-08-23",
          executedAt: null,
          status: "pending",
          amountArs: 1000,
          createdAt: 0,
          recurringExpense: {
            id: "expense-1",
            name: "Alquiler",
            amountArs: 1000,
            merchant: null,
            category: { id: "housing", name: "Vivienda", emoji: "🏠", slug: "vivienda" },
          },
        },
        {
          id: "paid-1",
          recurringExpenseId: "expense-1",
          transactionId: "transaction-1",
          scheduledDate: "2026-08-20",
          executedAt: 0,
          status: "confirmed",
          amountArs: 1000,
          createdAt: 0,
          recurringExpense: {
            id: "expense-1",
            name: "Alquiler",
            amountArs: 1000,
            merchant: null,
            category: { id: "housing", name: "Vivienda", emoji: "🏠", slug: "vivienda" },
          },
        },
      ],
      null,
      false,
      false,
      null,
      null,
      null,
      [],
      "",
      "",
      "1",
      null,
      "",
      "",
      "1",
    );

    const markup = renderToStaticMarkup(<RecurringList />);

    expect(markup).toContain("Pendientes de Este Mes");
    expect(markup).toContain("Pagados este mes");
    expect(markup).toContain("Alquiler");
    expect(markup).toContain('title="Editar"');
  });
});
