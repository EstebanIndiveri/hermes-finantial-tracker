import { findGroupSelection } from "@/lib/groups/disambiguation";

const groups = [
  { group_id: "personal-id", role: "owner" as const, group: { id: "personal-id", name: "Mi espacio" } },
  { group_id: "shared-id", role: "member" as const, group: { id: "shared-id", name: " mi ESPACIO " } },
  { group_id: "viaje-id", role: "member" as const, group: { id: "viaje-id", name: "Viaje" } },
];

describe("Telegram group selection", () => {
  it("resolves an exact group id even when names collide", () => {
    expect(findGroupSelection(groups, "shared-id")).toEqual({ kind: "match", group: groups[1] });
  });

  it("rejects duplicate normalized names instead of choosing the first", () => {
    expect(findGroupSelection(groups, "MI ESPACIO")).toEqual({
      kind: "ambiguous",
      groups: [groups[0], groups[1]],
    });
  });

  it("keeps unique name selection backward compatible", () => {
    expect(findGroupSelection(groups, " viaje ")).toEqual({ kind: "match", group: groups[2] });
  });
});
