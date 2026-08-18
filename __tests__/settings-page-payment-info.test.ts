import { renderToStaticMarkup } from "react-dom/server";
import { PaymentInfoForm } from "@/components/settings/payment-info-form";
import SettingsPage from "@/app/dashboard/settings/page";

describe("PaymentInfoForm", () => {
  it("renders the payment settings card and add action", () => {
    const markup = renderToStaticMarkup(<PaymentInfoForm />);

    expect(markup).toContain("Datos de Pago");
    expect(markup).toContain("Configura tus métodos de pago para recibir reintegros");
    expect(markup).toContain("Cargando...");
  });
});

describe("settings payment info integration", () => {
  it("renders the payment info form from the settings page", () => {
    const markup = renderToStaticMarkup(<SettingsPage />);

    expect(markup).toContain("Configuración");
    expect(markup).toContain("Datos de Pago");
  });
});
