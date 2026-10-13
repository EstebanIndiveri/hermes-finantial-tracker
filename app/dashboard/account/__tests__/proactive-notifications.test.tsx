import { renderToStaticMarkup } from "react-dom/server";
import { ProactiveNotificationsSection } from "../proactive-notifications";

it("distinguishes opt-in Telegram preferences from the existing browser Push pilot", () => {
  const html = renderToStaticMarkup(<ProactiveNotificationsSection />);
  expect(html).toContain("Avisos proactivos de Telegram");
  expect(html).toContain("Están apagados por defecto");
  expect(html).toContain("Los envíos proactivos del piloto beta siguen desactivados");
  expect(html).not.toContain("notificaciones del navegador");
});
