import { handleBalances } from "../commands/balances";
import { handleCerrar } from "../commands/cerrar";
import { db } from "@/lib/db/client";
import { calculateSessionBalances } from "@/lib/splits/balances";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      split_sessions: { findFirst: jest.fn() },
      splits: { findMany: jest.fn() },
      users: { findFirst: jest.fn() },
    },
    select: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock("@/lib/splits/balances", () => ({ calculateSessionBalances: jest.fn() }));

const session = { id: "session-1", name: "Cena & <amigos>", owner_user_id: "owner-1" };

function selectRows(rows: unknown[]) {
  return { from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(rows) }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  (db.query.split_sessions.findFirst as jest.Mock).mockResolvedValue(session);
  (db.query.splits.findMany as jest.Mock).mockResolvedValue([]);
});

it("escapes the session name in an empty balance", async () => {
  const message = await handleBalances("chat-1");
  expect(message).toContain("<b>Cena &amp; &lt;amigos&gt;</b>");
  expect(message).not.toContain("<b>Cena & <amigos></b>");
});

it("escapes the session name in a settled balance", async () => {
  (db.query.splits.findMany as jest.Mock).mockResolvedValue([{ id: "split-1", total_amount: 5 }]);
  (calculateSessionBalances as jest.Mock).mockReturnValue({ isSettled: true, debts: [] });
  (db.select as jest.Mock)
    .mockReturnValueOnce(selectRows([]))
    .mockReturnValueOnce(selectRows([]))
    .mockReturnValueOnce(selectRows([]));

  const message = await handleBalances("chat-1");
  expect(message).toContain("<b>Cena &amp; &lt;amigos&gt;</b>");
  expect(message).toContain("Todo saldado");
});

it("escapes session and participant names in an unsettled balance", async () => {
  (db.query.splits.findMany as jest.Mock).mockResolvedValue([{ id: "split-1", total_amount: 5 }]);
  (calculateSessionBalances as jest.Mock).mockReturnValue({
    isSettled: false,
    debts: [{ from: { userId: "user-1" }, to: { tempUserId: "temp-1" }, amount: 5 }],
  });
  (db.select as jest.Mock)
    .mockReturnValueOnce(selectRows([]))
    .mockReturnValueOnce(selectRows([]))
    .mockReturnValueOnce(selectRows([]))
    .mockReturnValueOnce(selectRows([{ id: "user-1", username: "A&B", name: "A" }]))
    .mockReturnValueOnce(selectRows([{ id: "temp-1", first_name: "<Temp>" }]));

  const message = await handleBalances("chat-1");
  expect(message).toContain("<b>Cena &amp; &lt;amigos&gt;</b>");
  expect(message).toContain("<b>A&amp;B</b> → <b>&lt;Temp&gt;</b>");
});

it("escapes the session name after an authorized close", async () => {
  (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "owner-1" });
  (db.update as jest.Mock).mockReturnValue({
    set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
  });

  const message = await handleCerrar("chat-1", "telegram-owner");
  expect(message).toContain("<b>Sesión cerrada: Cena &amp; &lt;amigos&gt;</b>");
  expect(db.update).toHaveBeenCalledTimes(1);
});
