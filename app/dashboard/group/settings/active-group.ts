export function resolveActiveGroup<T extends { group_id: string }>(
  groups: T[],
  activeGroupId: string | null,
): T | null {
  if (!activeGroupId) return groups[0] ?? null;
  return groups.find((group) => group.group_id === activeGroupId) ?? null;
}
