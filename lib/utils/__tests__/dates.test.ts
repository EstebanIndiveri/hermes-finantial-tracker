import { getArgentinaDate, getArgentinaDateKey, getArgentinaDayBounds, getActiveMonthArgentina, getMonthDateRange } from "../dates";

test("Argentina date key does not roll over at 21:00 local time", () => {
  expect(getArgentinaDateKey(new Date("2026-10-14T00:00:00.000Z"))).toBe("2026-10-13");
  expect(getArgentinaDateKey(new Date("2026-10-14T03:00:00.000Z"))).toBe("2026-10-14");
});

test("Argentina day bounds include the final millisecond and exclude the next midnight", () => {
  const { startMs, endExclusiveMs } = getArgentinaDayBounds("2026-10-13");
  expect(new Date(startMs).toISOString()).toBe("2026-10-13T03:00:00.000Z");
  expect(new Date(endExclusiveMs - 1).toISOString()).toBe("2026-10-14T02:59:59.999Z");
  expect(new Date(endExclusiveMs).toISOString()).toBe("2026-10-14T03:00:00.000Z");
});

test("Argentina day bounds reject malformed or impossible dates", () => {
  expect(() => getArgentinaDayBounds("2026-02-30")).toThrow();
  expect(() => getArgentinaDayBounds("2026-2-3")).toThrow();
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
