import { getSessionCookieName } from "../session-cookie";

const originalSessionCookieName = process.env.SESSION_COOKIE_NAME;

afterEach(() => {
  if (originalSessionCookieName === undefined) {
    delete process.env.SESSION_COOKIE_NAME;
  } else {
    process.env.SESSION_COOKIE_NAME = originalSessionCookieName;
  }
});

describe("getSessionCookieName", () => {
  test("uses the legacy name when SESSION_COOKIE_NAME is absent", () => {
    delete process.env.SESSION_COOKIE_NAME;

    expect(getSessionCookieName()).toBe("hermes_session");
  });

  test("uses a configured valid cookie name", () => {
    process.env.SESSION_COOKIE_NAME = "hermes_staging_session";

    expect(getSessionCookieName()).toBe("hermes_staging_session");
  });

  test.each(["", "session cookie", "session;cookie", "session=cookie", "sesión"]) (
    "rejects invalid configured cookie name %p",
    (value) => {
      process.env.SESSION_COOKIE_NAME = value;

      expect(() => getSessionCookieName()).toThrow("Invalid SESSION_COOKIE_NAME configuration");
    },
  );
});
