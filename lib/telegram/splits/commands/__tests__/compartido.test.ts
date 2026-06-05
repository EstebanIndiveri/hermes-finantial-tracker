import { handleCompartido } from "../compartido";
import { db } from "@/lib/db/client";
import { setConversationState } from "../../conversation-state";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      split_sessions: { findFirst: jest.fn() },
      users: { findFirst: jest.fn() },
      split_session_members: { findMany: jest.fn() },
    },
    insert: jest.fn(),
  },
}));

jest.mock("../../conversation-state", () => ({
  setConversationState: jest.fn(),
}));

function makeInsertMock() {
  return {
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
  };
}

describe("handleCompartido", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows Hermes and temp members as possible payers and re-fetches members after auto-adding the current user", async () => {
    const memberInsert = makeInsertMock();
    (db.insert as jest.Mock).mockReturnValue(memberInsert);
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1", status: "open" });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: "user-1",
      username: "esteban",
      name: "Esteban",
    });
    (db.query.split_session_members.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          session_id: "session-1",
          user_id: "user-2",
          temp_user_id: null,
          user: { id: "user-2", username: "alice", name: "Alice" },
          tempUser: null,
        },
        {
          session_id: "session-1",
          user_id: null,
          temp_user_id: "temp-1",
          user: null,
          tempUser: { id: "temp-1", telegram_username: "sabri", first_name: "Sabri" },
        },
      ])
      .mockResolvedValueOnce([
        {
          session_id: "session-1",
          user_id: "user-2",
          temp_user_id: null,
          user: { id: "user-2", username: "alice", name: "Alice" },
          tempUser: null,
        },
        {
          session_id: "session-1",
          user_id: null,
          temp_user_id: "temp-1",
          user: null,
          tempUser: { id: "temp-1", telegram_username: "sabri", first_name: "Sabri" },
        },
        {
          session_id: "session-1",
          user_id: "user-1",
          temp_user_id: null,
          user: { id: "user-1", username: "esteban", name: "Esteban" },
          tempUser: null,
        },
      ]);

    const response = await handleCompartido("chat-1", "telegram-1", "/compartido 3000 pizza");

    expect(memberInsert.values).toHaveBeenCalledWith({
      session_id: "session-1",
      user_id: "user-1",
      temp_user_id: null,
      joined_at: expect.any(Number),
    });
    expect(db.query.split_session_members.findMany).toHaveBeenCalledTimes(2);
    expect(response.replyMarkup?.inline_keyboard).toEqual([
      [{ text: "alice", callback_data: "paid_by:user:user-2" }],
      [{ text: "@sabri", callback_data: "paid_by:temp:temp-1" }],
      [{ text: "esteban (vos)", callback_data: "paid_by:user:user-1" }],
      [{ text: "💳 Pagaron varios", callback_data: "paid_by:varios" }],
    ]);
    expect(setConversationState).toHaveBeenCalledWith("chat-1", "telegram-1", {
      step: "who_paid",
      data: {
        step: "who_paid",
        amount: 3000,
        description: "pizza",
        session_id: "session-1",
      },
    });
  });
});
