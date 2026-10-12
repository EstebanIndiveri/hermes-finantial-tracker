import { findGroupSelection } from "@/lib/groups/disambiguation";
import { buildGroupPicker } from "@/lib/telegram/group-picker";

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

describe("Telegram group picker", () => {
  it("uses tappable group IDs internally and distinguishes same-name groups", () => {
    const picker = buildGroupPicker([
      { ...groups[0], group: { ...groups[0].group, owner: { username: "esteban" } } },
      { ...groups[1], group: { ...groups[1].group, owner: { username: "sabri" } } },
    ], "personal-id");

    expect(picker.text).toContain("Tocá un grupo");
    expect(picker.text).not.toContain("personal-id");
    expect(picker.text).not.toContain("shared-id");
    expect(picker.replyMarkup.inline_keyboard).toEqual([
      [{ text: "✓ Mi espacio · propio", callback_data: "group:select:personal-id" }],
      [{ text: "mi ESPACIO · de @sabri", callback_data: "group:select:shared-id" }],
    ]);
  });

  it("adds a short visual suffix only when labels are otherwise identical", () => {
    const picker = buildGroupPicker([
      { group_id: "11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "member", group: { id: "11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Viaje", owner: { username: "sabri" } } },
      { group_id: "22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb", role: "member", group: { id: "22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "Viaje", owner: { username: "sabri" } } },
    ], null);

    const labels = picker.replyMarkup.inline_keyboard.map((row) => row[0].text);
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels.every((label) => label.includes("Viaje · de @sabri"))).toBe(true);
  });
});
