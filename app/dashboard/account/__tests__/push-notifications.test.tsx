import { renderToStaticMarkup } from "react-dom/server";
import { base64UrlToUint8Array, PushNotificationsSection } from "../push-notifications";

it("describes the scoped beta delivery without claiming all notifications are off", () => {
  const html = renderToStaticMarkup(<PushNotificationsSection />);
  expect(html).toContain("Los envíos se limitan a cuentas y grupos habilitados");
  expect(html).not.toContain("Todavía no se envían avisos");
});

describe("base64UrlToUint8Array", () => {
  it("decodes URL-safe VAPID key material", () => {
    const previousWindow = global.window;
    Object.defineProperty(global, "window", {
      configurable: true,
      value: { atob: (value: string) => Buffer.from(value, "base64").toString("binary") },
    });

    try {
      expect(Array.from(base64UrlToUint8Array("AQID-_w"))).toEqual([1, 2, 3, 251, 252]);
    } finally {
      Object.defineProperty(global, "window", { configurable: true, value: previousWindow });
    }
  });
});
