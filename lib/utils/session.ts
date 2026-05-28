import { createHmac, timingSafeEqual } from "crypto";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not defined");
  return s;
}

export function signSession(userId: string): string {
  const payload = `${userId}:${Date.now()}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64");
}

export function verifySession(cookie: string): string | null {
  try {
    const decoded = Buffer.from(cookie, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const sig = parts.pop()!;
    const payload = parts.join(":");
    const expected = createHmac("sha256", getSecret()).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
    return parts[0];
  } catch {
    return null;
  }
}
