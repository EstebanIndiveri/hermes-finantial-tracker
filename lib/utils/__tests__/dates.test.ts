import { getArgentinaDate, getArgentinaDateKey, getActiveMonthArgentina, getMonthDateRange } from "../dates";

test("Argentina date key does not roll over at 21:00 local time", () => {
  expect(getArgentinaDateKey(new Date("2026-10-14T00:00:00.000Z"))).toBe("2026-10-13");
  expect(getArgentinaDateKey(new Date("2026-10-14T03:00:00.000Z"))).toBe("2026-10-14");
});

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
