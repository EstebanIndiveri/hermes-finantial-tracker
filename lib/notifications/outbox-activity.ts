// Aggregate-only metadata for the beta scheduler. Never include delivery IDs,
// chat IDs, endpoints, provider details, or response bodies in this header.
export function outboxActivityHeader(counts: {
  claimed: number;
  sent: number;
  retryable: number;
  dead: number;
  lostLease: number;
}): string | null {
  const values = [counts.claimed, counts.sent, counts.retryable, counts.dead, counts.lostLease];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 25) ||
      counts.sent + counts.retryable + counts.dead + counts.lostLease > counts.claimed) {
    return null;
  }
  return values.join(",");
}
