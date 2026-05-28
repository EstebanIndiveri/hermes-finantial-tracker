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

test("verifySession returns null for expired token", () => {
  const oldTimestamp = Date.now() - (31 * 24 * 60 * 60 * 1000);
  const payload = `user-123:${oldTimestamp}`;
  const crypto = require("crypto");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("hex");
  const expiredToken = Buffer.from(`${payload}:${sig}`).toString("base64");
  expect(verifySession(expiredToken)).toBeNull();
});

test("verifySession accepts token just before expiration", () => {
  const recentTimestamp = Date.now() - (29 * 24 * 60 * 60 * 1000);
  const payload = `user-456:${recentTimestamp}`;
  const crypto = require("crypto");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("hex");
  const recentToken = Buffer.from(`${payload}:${sig}`).toString("base64");
  expect(verifySession(recentToken)).toBe("user-456");
});
