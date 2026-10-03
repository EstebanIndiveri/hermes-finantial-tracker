import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SettingsPageClient } from "@/app/dashboard/settings/settings-client";
import { HermesSidebar } from "@/components/dashboard/HermesSidebar";

const mockSettingsStateQueue: unknown[] = [];
let mockRunEffects = false;

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");

  return {
    ...actual,
    useEffect: (effect: () => void) => {
      if (mockRunEffects) effect();
    },
    useState: (initial: unknown) => [mockSettingsStateQueue.length > 0 ? mockSettingsStateQueue.shift() : initial, jest.fn()],
  };
});

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams("month=2026-08"),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: jest.fn() }),
}));

jest.mock("@/components/dashboard/GroupSwitcher", () => ({
  GroupSwitcher: () => null,
}));

describe("settings month param wiring", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    mockRunEffects = false;
    mockSettingsStateQueue.length = 0;
  });

  it("loads monthly settings and budgets for the selected month", () => {
    mockRunEffects = true;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, headers: { get: jest.fn(() => null) }, json: jest.fn().mockResolvedValue([]) });

    renderToStaticMarkup(createElement(SettingsPageClient));

    expect(global.fetch).toHaveBeenCalledWith("/api/settings/monthly?month=2026-08");
    expect(global.fetch).toHaveBeenCalledWith("/api/settings/budgets?month=2026-08");
  });

  it("shows the selected month in the settings header", () => {
    mockSettingsStateQueue.push(
      { currency_mode: "USD_ARS", income_usd: 1000, exchange_rate: 1000, saving_goal_usd: 300, saving_goal_yellow: 100 },
      [],
      {},
      null,
      false,
      "owner",
      "USD_ARS",
      false,
      false,
      "1000",
      "1000",
      "300",
      "100",
      1000,
      null,
      null,
    );

    const markup = renderToStaticMarkup(createElement(SettingsPageClient));

    expect(markup).toContain("Editando agosto de 2026");
  });

  it("renders ARS-only income and saving goals without an FX field", () => {
    mockSettingsStateQueue.push(
      { currency_mode: "ARS_ARS", income_ars: 100000, saving_goal_ars: 20000, saving_goal_yellow_ars: 10000, exchange_rate: null },
      [], {}, null, false, "owner", "ARS_ARS", true, false,
      "100000", "0", "20000", "10000", 100000, null, null,
    );
    const markup = renderToStaticMarkup(createElement(SettingsPageClient));
    expect(markup).toContain("Ingreso mensual (ARS)");
    expect(markup).toContain("Meta verde (ARS)");
    expect(markup).not.toContain("Tipo de cambio (ARS/USD)");
  });

  it("preserves the selected month in the settings navigation link", () => {
    const markup = renderToStaticMarkup(createElement(HermesSidebar));

    expect(markup).toContain('href="/dashboard/settings?month=2026-08"');
  });
});
