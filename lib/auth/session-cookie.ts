const DEFAULT_SESSION_COOKIE_NAME = "hermes_session";

// Cookie names use the HTTP token grammar. Keeping this deliberately narrow
// prevents an environment value from changing how request Cookie headers parse.
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const MAX_COOKIE_NAME_LENGTH = 128;

/**
 * Resolves the session cookie name for server code.
 *
 * An absent setting preserves the legacy cookie name. A present invalid value
 * is a configuration error: callers must not continue with an ambiguous
 * authentication boundary.
 */
export function getSessionCookieName(): string {
  const configuredName = process.env.SESSION_COOKIE_NAME;

  if (configuredName === undefined) {
    return DEFAULT_SESSION_COOKIE_NAME;
  }

  if (
    configuredName.length === 0 ||
    configuredName.length > MAX_COOKIE_NAME_LENGTH ||
    !COOKIE_NAME_PATTERN.test(configuredName)
  ) {
    throw new Error("Invalid SESSION_COOKIE_NAME configuration");
  }

  return configuredName;
}
