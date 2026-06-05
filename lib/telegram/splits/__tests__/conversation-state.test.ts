// lib/telegram/splits/__tests__/conversation-state.test.ts
import { getConversationState, setConversationState, clearConversationState } from "../conversation-state";
import { db } from "@/lib/db/client";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: { bot_conversation_state: { findFirst: jest.fn() } },
    insert: jest.fn(),
    delete: jest.fn(),
  },
}));

describe("conversation state", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null when no state exists", async () => {
    (db.query.bot_conversation_state.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await getConversationState("chat1", "user1");
    expect(result).toBeNull();
  });

  it("returns null when state is expired", async () => {
    (db.query.bot_conversation_state.findFirst as jest.Mock).mockResolvedValue({
      state: JSON.stringify({ step: "waiting_amount", data: {} }),
      expires_at: Date.now() - 1000,
    });
    const deleteMock = { where: jest.fn().mockResolvedValue(undefined) };
    (db.delete as jest.Mock).mockReturnValue(deleteMock);
    const result = await getConversationState("chat1", "user1");
    expect(result).toBeNull();
  });

  it("returns parsed state when valid", async () => {
    const state = { step: "waiting_amount", data: { description: "Test" } };
    (db.query.bot_conversation_state.findFirst as jest.Mock).mockResolvedValue({
      state: JSON.stringify(state),
      expires_at: Date.now() + 60000,
    });
    const result = await getConversationState("chat1", "user1");
    expect(result).toEqual(state);
  });

  it("clears state by calling delete", async () => {
    const deleteMock = { where: jest.fn().mockResolvedValue(undefined) };
    (db.delete as jest.Mock).mockReturnValue(deleteMock);
    await clearConversationState("chat1", "user1");
    expect(db.delete).toHaveBeenCalled();
  });
});
