function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not defined");
  return s;
}

async function getKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage
  );
}

export async function signSession(userId: string): Promise<string> {
  const payload = `${userId}:${Date.now()}`;
  const key = await getKey(getSecret(), ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(`${payload}:${sigHex}`);
}

export async function verifySession(cookie: string): Promise<string | null> {
  try {
    const decoded = atob(cookie);
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const sig = parts.pop()!;
    const payload = parts.join(":");

    const sigBytes = Uint8Array.from(sig.match(/.{2}/g)!.map(h => parseInt(h, 16)));
    const key = await getKey(getSecret(), ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
    if (!valid) return null;

    const timestamp = parseInt(parts[1], 10);
    if (isNaN(timestamp)) return null;
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > maxAgeMs) return null;

    return parts[0];
  } catch {
    return null;
  }
}
