import { handleSplitGroupMessage } from "../handler";
import { db } from "@/lib/db/client";
import { handleActivar } from "../commands/activar";
import { handleBalances } from "../commands/balances";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      split_sessions: { findFirst: jest.fn() },
      users: { findFirst: jest.fn() },
      temp_users: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
  },
}));

jest.mock("../commands/activar", () => ({ handleActivar: jest.fn() }));
jest.mock("../commands/compartido", () => ({ handleCompartido: jest.fn() }));
jest.mock("../commands/balances", () => ({ handleBalances: jest.fn() }));
jest.mock("../commands/cerrar", () => ({ handleCerrar: jest.fn() }));
jest.mock("../commands/pague", () => ({ handlePague: jest.fn() }));

function makeInsertMock() {
  return {
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
  };
}

describe("handleSplitGroupMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (handleActivar as jest.Mock).mockResolvedValue("activado");
    (handleBalances as jest.Mock).mockResolvedValue("balances");
  });

  it("auto-registers Hermes users in an active session before routing commands", async () => {
    const memberInsert = makeInsertMock();
    (db.insert as jest.Mock).mockReturnValue(memberInsert);
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1", status: "open" });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-1" });

    const result = await handleSplitGroupMessage({
      chat: { id: 123, type: "group", title: "Cena" },
      from: { id: 99, is_bot: false, username: "esteban", first_name: "Esteban" },
      text: "/balances",
    });

    expect(result).toBe("balances");
    expect(db.query.split_sessions.findFirst).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(memberInsert.values).toHaveBeenCalledWith({
      session_id: "session-1",
      user_id: "user-1",
      temp_user_id: null,
      joined_at: expect.any(Number),
    });
    expect(memberInsert.onConflictDoNothing).toHaveBeenCalled();
  });

  it("creates temp users and auto-registers them in an active session", async () => {
    const tempInsert = makeInsertMock();
    const memberInsert = makeInsertMock();
    (db.insert as jest.Mock)
      .mockReturnValueOnce(tempInsert)
      .mockReturnValueOnce(memberInsert);
    (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue({ id: "session-1", status: "open" });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);
    (db.query.temp_users.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "temp-1", telegram_username: "sabri", first_name: "Sabri" });

    const result = await handleSplitGroupMessage({
      chat: { id: 123, type: "group", title: "Cena" },
      from: { id: 77, is_bot: false, username: "sabri", first_name: "Sabri", last_name: "Lopez" },
      text: "/balances",
    });

    expect(result).toBe("balances");
    expect(tempInsert.values).toHaveBeenCalledWith({
      id: expect.any(String),
      telegram_user_id: "77",
      telegram_username: "sabri",
      first_name: "Sabri",
      last_name: "Lopez",
      created_at: expect.any(Number),
      upgraded_to: null,
    });
    expect(tempInsert.onConflictDoNothing).toHaveBeenCalled();
    expect(memberInsert.values).toHaveBeenCalledWith({
      session_id: "session-1",
      user_id: null,
      temp_user_id: "temp-1",
      joined_at: expect.any(Number),
    });
  });

  it("skips auto-registration for messages sent by bots", async () => {
    const result = await handleSplitGroupMessage({
      chat: { id: 123, type: "group", title: "Cena" },
      from: { id: 999, is_bot: true, username: "hermes_bot", first_name: "Hermes" },
      text: "/balances",
    });

    expect(result).toBe("balances");
    expect(db.query.split_sessions.findFirst).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips auto-registration for new_chat_members updates", async () => {
    const result = await handleSplitGroupMessage({
      chat: { id: 123, type: "group", title: "Cena" },
      from: { id: 88, is_bot: false, username: "sabri", first_name: "Sabri" },
      text: "/balances",
      new_chat_members: [{ id: 77, is_bot: false, username: "nuevo" }],
    });

    expect(result).toBeNull();
    expect(db.query.split_sessions.findFirst).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
