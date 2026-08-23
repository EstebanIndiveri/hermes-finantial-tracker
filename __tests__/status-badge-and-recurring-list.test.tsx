import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge, getExecutionStatus } from "@/components/ui/status-badge";
import { RecurringList } from "@/components/recurring/recurring-list";

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

  it("includes pending and paid section headings in the source", () => {
    const source = RecurringList.toString();

    expect(source).toContain("Pendientes de Este Mes");
    expect(source).toContain("Pagados este mes");
    expect(source).toContain("StatusBadge");
    expect(source).toContain("getExecutionStatus");
  });
});
