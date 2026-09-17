const PRODUCTION_HOSTS = new Set(["hermes-finantial-tracker.vercel.app"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type E2EEnvironment = Record<string, string | undefined>;

function normalizedHostname(value: string): string {
  return value.toLowerCase().replace(/\.$/, "");
}

export function requireSafeE2EBaseUrl(
  environment: E2EEnvironment = process.env,
): string {
  const rawValue = environment.E2E_BASE_URL?.trim();
  if (!rawValue) {
    throw new Error(
      "E2E_BASE_URL is required. E2E has no default target and must never point to production.",
    );
  }

  let target: URL;
  try {
    target = new URL(rawValue);
  } catch {
    throw new Error("E2E_BASE_URL must be a valid absolute URL.");
  }

  if (!new Set(["http:", "https:"]).has(target.protocol)) {
    throw new Error("E2E_BASE_URL must use HTTP or HTTPS.");
  }
  if (target.username || target.password) {
    throw new Error("E2E_BASE_URL must not contain credentials.");
  }
  if (target.pathname !== "/" || target.search || target.hash) {
    throw new Error("E2E_BASE_URL must be an origin without path, query, or fragment.");
  }

  const hostname = normalizedHostname(target.hostname);
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new Error("E2E_BASE_URL points to the Hermes production host and is forbidden.");
  }

  if (LOOPBACK_HOSTS.has(hostname)) {
    return target.origin;
  }

  const allowedHost = environment.E2E_ALLOWED_HOST
    ? normalizedHostname(environment.E2E_ALLOWED_HOST)
    : undefined;
  const remoteApproved = environment.E2E_ALLOW_REMOTE === "1";

  if (!remoteApproved || !allowedHost || allowedHost !== hostname) {
    throw new Error(
      "Remote E2E requires E2E_ALLOW_REMOTE=1 and an exact E2E_ALLOWED_HOST match.",
    );
  }
  if (target.protocol !== "https:") {
    throw new Error("Remote E2E targets must use HTTPS.");
  }

  return target.origin;
}

export function requireE2ECredentials(
  environment: E2EEnvironment = process.env,
): { username: string; password: string } {
  const username = environment.E2E_USERNAME?.trim();
  const password = environment.E2E_PASSWORD;

  if (!username || !password) {
    throw new Error("E2E_USERNAME and E2E_PASSWORD are required for authenticated E2E.");
  }

  return { username, password };
}
