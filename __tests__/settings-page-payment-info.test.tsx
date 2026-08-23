import { renderToStaticMarkup } from "react-dom/server";
import { PaymentInfoForm } from "@/components/settings/payment-info-form";
import SettingsPage from "@/app/dashboard/settings/page";

describe("PaymentInfoForm", () => {
  it("renders the loading state before payment data is fetched", () => {
    const markup = renderToStaticMarkup(<PaymentInfoForm />);

    expect(markup).toContain("Cargando...");
  });
});

describe("settings payment info integration", () => {
  it("renders the settings loading skeleton that includes payment info placeholders", () => {
    const markup = renderToStaticMarkup(<SettingsPage />);

    expect(markup).toContain("grid-template-columns:1fr 140px 120px");
    expect(markup).toContain("width:160px;height:38px");
  });
});
