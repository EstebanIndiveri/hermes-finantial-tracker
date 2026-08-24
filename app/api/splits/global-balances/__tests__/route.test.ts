import { GET } from "../../global-balances/route";
import { verifySession } from "@/lib/auth/session";
import { calculateGlobalBalances } from "@/lib/splits/global-balances";
import { db } from "@/lib/db/client";
import { cookies } from "next/headers";

jest.mock("@/lib/auth/session", () => ({
  verifySession: jest.fn(),
}));

jest.mock("@/lib/splits/global-balances", () => ({
  calculateGlobalBalances: jest.fn(),
}));

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      users: { findMany: jest.fn() },
      temp_users: { findMany: jest.fn() },
    },
  },
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));


describe("GET /api/splits/global-balances", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cookies as jest.Mock).mockResolvedValue({ get: jest.fn(() => ({ value: "session-token" })) });
  });

  it("returns 401 when the user is not authenticated", async () => {
    (verifySession as jest.Mock).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns global balances enriched with partner names from users and temp users", async () => {
    (verifySession as jest.Mock).mockResolvedValue("user-1");
    (calculateGlobalBalances as jest.Mock).mockResolvedValue({
      partnerBalances: [
        {
          partner: { userId: "user-2" },
          net: 25,
          sessionBreakdown: [{ sessionId: "session-1", sessionName: "Trip", net: 25 }],
        },
        {
          partner: { tempUserId: "temp-1" },
          net: -10,
          sessionBreakdown: [{ sessionId: "session-2", sessionName: "Dinner", net: -10 }],
        },
      ],
      youOwe: [{ from: { userId: "user-1" }, to: { tempUserId: "temp-1" }, amount: 10, sessionIds: ["session-2"] }],
      theyOwe: [{ from: { userId: "user-2" }, to: { userId: "user-1" }, amount: 25, sessionIds: ["session-1"] }],
      totalYouOwe: 10,
      totalTheyOwe: 25,
    });
    (db.query.users.findMany as jest.Mock).mockResolvedValue([{ id: "user-2", name: "Ana" }]);
    (db.query.temp_users.findMany as jest.Mock).mockResolvedValue([{ id: "temp-1", first_name: "Beto", last_name: "Temp" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      partnerBalances: [
        {
          partner: { userId: "user-2" },
          partnerName: "Ana",
          net: 25,
          sessionBreakdown: [{ sessionId: "session-1", sessionName: "Trip", net: 25 }],
        },
        {
          partner: { tempUserId: "temp-1" },
          partnerName: "Beto Temp",
          net: -10,
          sessionBreakdown: [{ sessionId: "session-2", sessionName: "Dinner", net: -10 }],
        },
      ],
      youOwe: [{ from: { userId: "user-1" }, to: { tempUserId: "temp-1" }, amount: 10, sessionIds: ["session-2"] }],
      theyOwe: [{ from: { userId: "user-2" }, to: { userId: "user-1" }, amount: 25, sessionIds: ["session-1"] }],
      totalYouOwe: 10,
      totalTheyOwe: 25,
    });
    expect(calculateGlobalBalances).toHaveBeenCalledWith("user-1");
  });

  it("falls back to a default partner name when no matching user exists", async () => {
    (verifySession as jest.Mock).mockResolvedValue("user-1");
    (calculateGlobalBalances as jest.Mock).mockResolvedValue({
      partnerBalances: [
        {
          partner: { userId: "missing-user" },
          net: 5,
          sessionBreakdown: [{ sessionId: "session-1", sessionName: "Trip", net: 5 }],
        },
      ],
      youOwe: [],
      theyOwe: [{ from: { userId: "missing-user" }, to: { userId: "user-1" }, amount: 5, sessionIds: ["session-1"] }],
      totalYouOwe: 0,
      totalTheyOwe: 5,
    });
    (db.query.users.findMany as jest.Mock).mockResolvedValue([]);
    (db.query.temp_users.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      partnerBalances: [
        {
          partner: { userId: "missing-user" },
          partnerName: "Usuario desconocido",
          net: 5,
          sessionBreakdown: [{ sessionId: "session-1", sessionName: "Trip", net: 5 }],
        },
      ],
      youOwe: [],
      theyOwe: [{ from: { userId: "missing-user" }, to: { userId: "user-1" }, amount: 5, sessionIds: ["session-1"] }],
      totalYouOwe: 0,
      totalTheyOwe: 5,
    });
  });
});
