import { renderToStaticMarkup } from "react-dom/server";
import HistorialPage from "@/app/dashboard/balances/historial/page";
import { HermesSidebar } from "@/components/dashboard/HermesSidebar";
import { HistorialClient } from "@/app/dashboard/balances/historial/HistorialClient";

const mockSidebarStateQueue: unknown[] = [];

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");

  return {
    ...actual,
    useState: (initial: unknown) =>
      mockSidebarStateQueue.length > 0 ? [mockSidebarStateQueue.shift(), jest.fn()] : actual.useState(initial),
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/balances/historial",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: jest.fn() }),
}));

jest.mock("@/components/dashboard/GroupSwitcher", () => ({
  GroupSwitcher: () => null,
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: jest.fn(() => null),
  }),
}));

jest.mock("@/lib/splits/payment-history", () => ({
  getPaymentHistoryForUser: jest.fn().mockResolvedValue({ items: [], total: 0 }),
}));

describe("HistorialClient", () => {
  it("renders the empty state copy", () => {
    const markup = renderToStaticMarkup(
      <HistorialClient
        initialItems={[]}
        partners={[]}
        initialFilters={{ partnerId: "", from: "", to: "", limit: 20, offset: 0 }}
      />,
    );

    expect(markup).toContain("No hay pagos registrados");
    expect(markup).toContain("Historial de pagos");
  });
});

describe("payment history page integration", () => {
  it("renders the page heading", async () => {
    const markup = renderToStaticMarkup(await HistorialPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Historial de pagos");
    expect(markup).toContain("Filtrá pagos enviados y recibidos");
  });
});

describe("dashboard sidebar integration for payment history", () => {
  it("includes a payment history navigation link", () => {
    mockSidebarStateQueue.push(false, false, true);
    const markup = renderToStaticMarkup(<HermesSidebar />);

    expect(markup).toContain('href="/dashboard/balances/historial"');
    expect(markup).toContain("Historial de pagos");
  });
});
