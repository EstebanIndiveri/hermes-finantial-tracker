export function isCronRequestAuthorized(
  authorization: string | null,
  cronSecret: string | undefined,
): boolean {
  return typeof cronSecret === "string" && cronSecret.trim().length > 0 && authorization === `Bearer ${cronSecret}`;
}
