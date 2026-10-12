export interface SelectableGroup {
  group_id: string;
  group: { id: string; name: string };
}

export function normalizeGroupName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function findGroupSelection<T extends SelectableGroup>(
  groups: T[],
  selection: string,
):
  | { kind: "match"; group: T }
  | { kind: "ambiguous"; groups: T[] }
  | { kind: "missing" } {
  const value = selection.trim();
  const byId = groups.find((group) => group.group_id === value || group.group.id === value);
  if (byId) return { kind: "match", group: byId };

  const byName = groups.filter((group) => normalizeGroupName(group.group.name) === normalizeGroupName(value));
  if (byName.length === 1) return { kind: "match", group: byName[0] };
  if (byName.length > 1) return { kind: "ambiguous", groups: byName };
  return { kind: "missing" };
}
