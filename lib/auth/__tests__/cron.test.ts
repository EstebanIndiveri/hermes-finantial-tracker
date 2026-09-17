import { isCronRequestAuthorized } from "../cron";

describe("isCronRequestAuthorized", () => {
  it.each([
    [undefined, null],
    [undefined, "Bearer undefined"],
    ["", "Bearer "],
    ["   ", "Bearer    "],
    ["configured-secret", null],
    ["configured-secret", "Bearer "],
    ["configured-secret", "Bearer wrong-secret"],
  ])("rejects absent, empty, and mismatched secrets (%p, %p)", (secret, authorization) => {
    expect(isCronRequestAuthorized(authorization, secret)).toBe(false);
  });

  it("accepts only the exact configured Bearer token", () => {
    expect(isCronRequestAuthorized("Bearer configured-secret", "configured-secret")).toBe(true);
  });
});
