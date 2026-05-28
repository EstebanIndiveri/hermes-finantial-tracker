const ARGENTINA_TZ = "America/Argentina/Buenos_Aires";

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
