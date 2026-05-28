import { getArgentinaDate, getActiveMonthArgentina, getMonthDateRange } from "../dates";

test("getArgentinaDate returns a Date", () => {
  const d = getArgentinaDate();
  expect(d instanceof Date).toBe(true);
});

test("getActiveMonthArgentina returns YYYY-MM format", () => {
  const m = getActiveMonthArgentina();
  expect(m).toMatch(/^\d{4}-\d{2}$/);
});

test("getMonthDateRange returns correct start and end for 2026-05", () => {
  const range = getMonthDateRange("2026-05");
  expect(range.start).toBe("2026-05-01");
  expect(range.end).toBe("2026-05-31");
});

test("getMonthDateRange handles February 2024 (leap year)", () => {
  const range = getMonthDateRange("2024-02");
  expect(range.end).toBe("2024-02-29");
});
