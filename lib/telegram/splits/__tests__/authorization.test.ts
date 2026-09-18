import { db } from "@/lib/db/client";
import { resolveAuthorizedSplitContext } from "../authorization";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      split_sessions: { findFirst: jest.fn() },
      users: { findFirst: jest.fn() },
      temp_users: { findFirst: jest.fn() },
      split_session_members: { findFirst: jest.fn() },
    },
  },
}));

describe("resolveAuthorizedSplitContext", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects when there is no open session", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveAuthorizedSplitContext("chat-1", "telegram-1")).resolves.toEqual({
      ok: false,
      reason: "no_open_session",
    });
  });

  it("rejects an unknown Telegram actor", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1", status: "open" });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);
    (db.query.temp_users.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveAuthorizedSplitContext("chat-1", "telegram-1")).resolves.toEqual({
      ok: false,
      reason: "unknown_actor",
    });
  });

  it("rejects a known actor who is not a member of this session", async () => {
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1", status: "open" });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-1" });
    (db.query.split_session_members.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveAuthorizedSplitContext("chat-1", "telegram-1")).resolves.toEqual({
      ok: false,
      reason: "not_member",
    });
  });

  it("returns the exact user actor for a session member", async () => {
    const session = { id: "session-1", telegram_chat_id: "chat-1", status: "open", owner_user_id: "user-1" };
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(session);
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-1" });
    (db.query.split_session_members.findFirst as jest.Mock).mockResolvedValue({ session_id: "session-1", user_id: "user-1" });

    await expect(resolveAuthorizedSplitContext("chat-1", "telegram-1", "session-1")).resolves.toEqual({
      ok: true,
      context: { session, actor: { kind: "user", id: "user-1" } },
    });
  });
});
