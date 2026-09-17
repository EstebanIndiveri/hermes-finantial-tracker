import {
  requireE2ECredentials,
  requireSafeE2EBaseUrl,
} from "@/e2e/test-target";

describe("E2E target safety", () => {
  test("requires an explicit target", () => {
    expect(() => requireSafeE2EBaseUrl({})).toThrow(/required/i);
  });

  test("rejects the production target even with remote approval", () => {
    expect(() =>
      requireSafeE2EBaseUrl({
        E2E_BASE_URL: "https://hermes-finantial-tracker.vercel.app",
        E2E_ALLOW_REMOTE: "1",
        E2E_ALLOWED_HOST: "hermes-finantial-tracker.vercel.app",
      }),
    ).toThrow(/production/i);
  });

  test("accepts an explicit loopback origin", () => {
    expect(
      requireSafeE2EBaseUrl({ E2E_BASE_URL: "http://127.0.0.1:3000" }),
    ).toBe("http://127.0.0.1:3000");
  });

  test("rejects remote and lookalike hosts without an exact approval", () => {
    expect(() =>
      requireSafeE2EBaseUrl({ E2E_BASE_URL: "https://staging.example.test" }),
    ).toThrow(/remote/i);
    expect(() =>
      requireSafeE2EBaseUrl({ E2E_BASE_URL: "http://localhost.example.test" }),
    ).toThrow(/remote/i);
  });

  test("accepts one HTTPS remote host when it matches the allowlist", () => {
    expect(
      requireSafeE2EBaseUrl({
        E2E_BASE_URL: "https://hermes-staging.example.test",
        E2E_ALLOW_REMOTE: "1",
        E2E_ALLOWED_HOST: "hermes-staging.example.test",
      }),
    ).toBe("https://hermes-staging.example.test");
  });

  test("requires credentials without providing defaults", () => {
    expect(() => requireE2ECredentials({})).toThrow(/required/i);
    expect(
      requireE2ECredentials({ E2E_USERNAME: "qa", E2E_PASSWORD: "synthetic" }),
    ).toEqual({ username: "qa", password: "synthetic" });
  });
});
