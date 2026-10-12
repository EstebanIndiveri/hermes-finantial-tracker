import { resolveActiveGroup } from "../active-group";

const groups = [
  { group_id: "personal", group: { name: "Mi espacio" } },
  { group_id: "test", group: { name: "test" } },
];

describe("group settings active group", () => {
  it("selects the active group instead of the first membership", () => {
    expect(resolveActiveGroup(groups, "test")?.group_id).toBe("test");
  });

  it("falls back only when no active group was selected", () => {
    expect(resolveActiveGroup(groups, null)?.group_id).toBe("personal");
  });

  it("does not show an unrelated group if the active membership is missing", () => {
    expect(resolveActiveGroup(groups, "other")).toBeNull();
  });
});
