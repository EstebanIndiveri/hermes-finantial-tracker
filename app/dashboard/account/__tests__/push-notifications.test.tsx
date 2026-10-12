import { base64UrlToUint8Array } from "../push-notifications";

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
