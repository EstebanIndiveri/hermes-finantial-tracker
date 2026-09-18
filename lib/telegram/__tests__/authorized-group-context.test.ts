import { resolveAuthorizedTelegramGroup } from "../authorized-group-context";
import { db } from "@/lib/db/client";
import { getGroupMembership, getPersonalGroup } from "@/lib/groups/permissions";

jest.mock("@/lib/db/client", () => ({
  db: { update: jest.fn() },
}));
jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: jest.fn(),
  getPersonalGroup: jest.fn(),
}));

describe("resolveAuthorizedTelegramGroup", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps an active group with current membership", async () => {
    (getGroupMembership as jest.Mock).mockResolvedValue({ group_id: "group-active" });
    expect(await resolveAuthorizedTelegramGroup("user-1", "group-active")).toBe("group-active");
    expect(getPersonalGroup).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("conditionally clears a stale pointer and falls back to the personal group", async () => {
    (getGroupMembership as jest.Mock).mockResolvedValue(null);
    (getPersonalGroup as jest.Mock).mockResolvedValue("group-personal");
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where }));
    (db.update as jest.Mock).mockReturnValue({ set });

    expect(await resolveAuthorizedTelegramGroup("user-1", "group-removed")).toBe("group-personal");
    expect(set).toHaveBeenCalledWith({ active_telegram_group_id: null });
    expect(where).toHaveBeenCalled();
    expect(getPersonalGroup).toHaveBeenCalledWith("user-1");
  });

  it("uses the personal group directly when there is no active pointer", async () => {
    (getPersonalGroup as jest.Mock).mockResolvedValue("group-personal");
    expect(await resolveAuthorizedTelegramGroup("user-1", null)).toBe("group-personal");
    expect(getGroupMembership).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
