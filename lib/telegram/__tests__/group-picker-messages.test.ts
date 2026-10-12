import { handleTelegramMessage } from "../handlers";
import { getUserGroups } from "@/lib/groups/permissions";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
  },
}));
jest.mock("@/lib/groups/permissions", () => ({ getUserGroups: jest.fn() }));

const mockGroups = getUserGroups as jest.MockedFunction<typeof getUserGroups>;
const entries = [
  { group_id: "own-uuid", role: "owner" as const, group: { id: "own-uuid", name: "Mi espacio", owner: { username: "esteban" } } },
  { group_id: "shared-uuid", role: "member" as const, group: { id: "shared-uuid", name: "Mi espacio", owner: { username: "sabri" } } },
];

function command(text: string) {
  return handleTelegramMessage({
    update_id: 1,
    message: { text, chat: { id: 123 }, from: { id: 456 } },
  }, "user-1", "own-uuid");
}

describe("Telegram group picker commands", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroups.mockResolvedValue(entries as Awaited<ReturnType<typeof getUserGroups>>);
  });

  it("offers buttons in /grupos without exposing UUIDs in text", async () => {
    const response = await command("/grupos");

    expect(response.text).not.toContain("own-uuid");
    expect(response.text).not.toContain("shared-uuid");
    expect(response.replyMarkup?.inline_keyboard).toHaveLength(2);
    expect(response.replyMarkup?.inline_keyboard[1][0].callback_data).toBe("group:select:shared-uuid");
  });

  it("shows tappable alternatives for an ambiguous name", async () => {
    const response = await command("/grupo Mi espacio");

    expect(response.text).toContain("más de un grupo");
    expect(response.replyMarkup?.inline_keyboard).toHaveLength(2);
    expect(db.update).not.toHaveBeenCalled();
  });
});
