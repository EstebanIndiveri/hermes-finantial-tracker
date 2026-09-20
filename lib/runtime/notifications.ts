export type NotificationsRuntimeMode = "enabled" | "disabled" | "invalid";

/**
 * Resolves the broad kill switch for proactive delivery.
 *
 * Missing configuration preserves the legacy behavior. A present value must be
 * exact so that typos never enable delivery in an isolated environment.
 */
export function getNotificationsRuntimeMode(
  env: NodeJS.ProcessEnv = process.env,
): NotificationsRuntimeMode {
  const configured = env.NOTIFICATIONS_ENABLED;

  if (configured === undefined || configured === "true") return "enabled";
  if (configured === "false") return "disabled";
  return "invalid";
}
