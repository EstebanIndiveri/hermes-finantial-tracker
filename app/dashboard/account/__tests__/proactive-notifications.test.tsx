import { renderToStaticMarkup } from "react-dom/server";
import { ProactiveNotificationsSection } from "../proactive-notifications";

it("distinguishes opt-in Telegram preferences from the existing browser Push pilot", () => {
  const html = renderToStaticMarkup(<ProactiveNotificationsSection />);
  expect(html).toContain("Avisos proactivos de Telegram");
  expect(html).toContain("Estas opciones están desmarcadas por defecto");
  expect(html).toContain("el resumen diario y los recordatorios recurrentes solo se envían a cuentas y grupos de prueba habilitados");
  expect(html).toContain("Los avisos de reintegros siguen apagados");
  expect(html).not.toContain("notificaciones del navegador");
});
