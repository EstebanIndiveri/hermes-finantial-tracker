import { readFileSync } from "fs";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/lib/splits/global-balances", () => ({
  calculateGlobalBalances: jest.fn(async () => ({
    partnerBalances: [], youOwe: [], theyOwe: [], totalYouOwe: 1500, totalTheyOwe: 3200,
  })),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(async () => ({ get: (key: string) => (key === "x-user-id" ? "user-1" : null) })),
}));

jest.mock("@/app/dashboard/balances/BalancesClient", () => ({
  BalancesClient: ({ initialSummary }: { initialSummary: { totalYouOwe: number; totalTheyOwe: number } }) => (
    <div>
      <h1>Balances globales</h1>
      <span>Debés ${initialSummary.totalYouOwe}</span>
      <span>Te deben ${initialSummary.totalTheyOwe}</span>
    </div>
  ),
}));

describe("balances page integration", () => {
  it("renders the balances summary from the page", async () => {
    const BalancesPage = (await import("@/app/dashboard/balances/page")).default;
    const markup = renderToStaticMarkup(await BalancesPage());
    expect(markup).toContain("Balances globales");
    expect(markup).toContain("Debés $1500");
    expect(markup).toContain("Te deben $3200");
  });
});

describe("dashboard sidebar balances integration", () => {
  it("includes a balances navigation link in the sidebar source", () => {
    const source = readFileSync("components/dashboard/HermesSidebar.tsx", "utf8");
    expect(source).toContain('href="/dashboard/balances"');
    expect(source).toContain("Balances");
  });
});
