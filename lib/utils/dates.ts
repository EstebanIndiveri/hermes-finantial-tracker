const ARGENTINA_TZ = "America/Argentina/Buenos_Aires";

/** Calendar date in Argentina, independent of the server's local time zone. */
export function getArgentinaDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ARGENTINA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (kind: "year" | "month" | "day") =>
    parts.find((part) => part.type === kind)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) throw new Error("Argentina calendar date unavailable");
  return `${year}-${month}-${day}`;
}

export function getArgentinaDate(): Date {
  const now = new Date();
  const arStr = now.toLocaleString("en-US", { timeZone: ARGENTINA_TZ });
  return new Date(arStr);
}

export function getActiveMonthArgentina(): string {
  const d = getArgentinaDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getMonthDateRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
