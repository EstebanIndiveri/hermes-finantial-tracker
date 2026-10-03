import { renderToStaticMarkup } from "react-dom/server";
import { HermesExpenseForm } from "@/components/forms/HermesExpenseForm";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

describe("dashboard expense form currency", () => {
  it("does not offer a fabricated USD preview for an ARS-only month", () => {
    const markup = renderToStaticMarkup(
      <HermesExpenseForm categories={[]} currencyMode="ARS_ARS" exchangeRate={null} month="2026-10" />,
    );

    expect(markup).toContain("Monto (ARS)");
    expect(markup).not.toContain("≈ USD");
  });

  it("keeps the USD preview for a mixed month with a positive rate", () => {
    const markup = renderToStaticMarkup(
      <HermesExpenseForm categories={[]} currencyMode="USD_ARS" exchangeRate={1600} month="2026-10" />,
    );

    expect(markup).toContain("≈ USD");
  });
});
