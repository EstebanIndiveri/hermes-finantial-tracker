import { signSession, verifySession } from "../session";

process.env.SESSION_SECRET = "test-secret-32-chars-long-padding!!";

test("signSession returns a non-empty string", () => {
  const token = signSession("user-123");
  expect(typeof token).toBe("string");
  expect(token.length).toBeGreaterThan(10);
});

test("verifySession returns userId for valid token", () => {
  const token = signSession("user-abc");
  const result = verifySession(token);
  expect(result).toBe("user-abc");
});

test("verifySession returns null for tampered token", () => {
  const token = signSession("user-abc");
  const tampered = token.slice(0, -4) + "xxxx";
  expect(verifySession(tampered)).toBeNull();
});

test("verifySession returns null for garbage input", () => {
  expect(verifySession("not-a-token")).toBeNull();
});
