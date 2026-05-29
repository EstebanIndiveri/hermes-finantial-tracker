import { signSession, verifySession } from "../session";

process.env.SESSION_SECRET = "test-secret-32-chars-long-padding!!";

async function createTestToken(userId: string, timestamp: number): Promise<string> {
  const payload = `${userId}:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.SESSION_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(`${payload}:${sigHex}`);
}

test("signSession returns a non-empty string", async () => {
  const token = await signSession("user-123");
  expect(typeof token).toBe("string");
  expect(token.length).toBeGreaterThan(10);
});

test("verifySession returns userId for valid token", async () => {
  const token = await signSession("user-abc");
  const result = await verifySession(token);
  expect(result).toBe("user-abc");
});

test("verifySession returns null for tampered token", async () => {
  const token = await signSession("user-abc");
  const tampered = token.slice(0, -4) + "xxxx";
  expect(await verifySession(tampered)).toBeNull();
});

test("verifySession returns null for garbage input", async () => {
  expect(await verifySession("not-a-token")).toBeNull();
});

test("verifySession returns null for expired token", async () => {
  const oldTimestamp = Date.now() - (31 * 24 * 60 * 60 * 1000);
  const expiredToken = await createTestToken("user-123", oldTimestamp);
  expect(await verifySession(expiredToken)).toBeNull();
});

test("verifySession accepts token just before expiration", async () => {
  const recentTimestamp = Date.now() - (29 * 24 * 60 * 60 * 1000);
  const recentToken = await createTestToken("user-456", recentTimestamp);
  expect(await verifySession(recentToken)).toBe("user-456");
});
