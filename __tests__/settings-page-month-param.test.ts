import fs from "fs";
import path from "path";

const repoRoot = path.join(__dirname, "..");

describe("settings month param wiring", () => {
  it("reads the month from search params and forwards it to settings APIs", () => {
    const source = fs.readFileSync(path.join(repoRoot, "app/dashboard/settings/page.tsx"), "utf8");

    expect(source).toContain('const searchParams = useSearchParams();');
    expect(source).toContain('const month = searchParams.get("month");');
    expect(source).toContain('fetch(`/api/settings/monthly${monthQuery}`)');
    expect(source).toContain('fetch(`/api/settings/budgets${monthQuery}`)');
    expect(source).toContain('body: JSON.stringify({ income_usd: income, exchange_rate: exchange, month: month ?? undefined })');
    expect(source).toContain('body: JSON.stringify({ saving_goal_usd: green, saving_goal_yellow: yellow, month: month ?? undefined })');
    expect(source).toContain('body: JSON.stringify({ items, month: month ?? undefined })');
  });

  it("shows the edited month in the header", () => {
    const source = fs.readFileSync(path.join(repoRoot, "app/dashboard/settings/page.tsx"), "utf8");

    expect(source).toContain('Editando {monthLabel} · configuración mensual y presupuestos');
    expect(source).toContain('new Intl.DateTimeFormat("es-AR"');
  });

  it("preserves the month parameter in the sidebar settings link", () => {
    const source = fs.readFileSync(path.join(repoRoot, "components/dashboard/HermesSidebar.tsx"), "utf8");

    expect(source).toContain('const searchParams = useSearchParams();');
    expect(source).toContain('const month = searchParams.get("month");');
    expect(source).toContain('{ pathname: "/dashboard/settings", query: { month } }');
  });
});
