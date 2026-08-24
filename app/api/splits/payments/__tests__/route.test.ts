import { NextRequest } from "next/server";

jest.mock("@/lib/auth/session", () => ({ verifySession: jest.fn() }));
jest.mock("@/lib/splits/global-balances", () => ({ calculateGlobalBalances: jest.fn() }));
jest.mock("@/lib/db/client", () => ({
  db: {
    insert: jest.fn(),
    query: {
      split_sessions: { findFirst: jest.fn() },
      split_session_members: { findFirst: jest.fn() },
      users: { findFirst: jest.fn() },
    },
  },
}));
jest.mock("@/lib/notifications/telegram", () => ({ notifySplitPaymentReceived: jest.fn() }));

const { verifySession } = require("@/lib/auth/session");
const { calculateGlobalBalances } = require("@/lib/splits/global-balances");
const { db } = require("@/lib/db/client");
const { notifySplitPaymentReceived } = require("@/lib/notifications/telegram");

function makeReq(body: object, cookie = "session-token"): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.set("cookie", `hermes_session=${cookie}`);
  return new NextRequest("http://localhost/api/splits/payments", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/splits/payments", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when the user is not authenticated", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue(null);
    const response = await POST(makeReq({ payeeUserId: "user-2", amount: 1000 }));
    expect(response.status).toBe(401);
  });

  it("returns 400 when amount is invalid", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    const response = await POST(makeReq({ payeeUserId: "user-2", amount: 0 }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when no matching debt exists", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    calculateGlobalBalances.mockResolvedValue({ youOwe: [], partnerBalances: [], theyOwe: [], totalYouOwe: 0, totalTheyOwe: 0 });
    const response = await POST(makeReq({ payeeUserId: "user-2", amount: 1000 }));
    expect(response.status).toBe(404);
  });

  it("returns 400 when amount exceeds debt", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    calculateGlobalBalances.mockResolvedValue({
      youOwe: [{ from: { userId: "user-1" }, to: { userId: "user-2" }, amount: 1500, sessionIds: ["session-1"] }],
      partnerBalances: [{ partner: { userId: "user-2" }, partnerName: "Maria", net: -1500, sessionBreakdown: [{ sessionId: "session-1", sessionName: "Viaje", net: -1500 }] }],
      theyOwe: [], totalYouOwe: 1500, totalTheyOwe: 0,
    });
    const response = await POST(makeReq({ payeeUserId: "user-2", amount: 2000 }));
    expect(response.status).toBe(400);
  });

  it("returns 403 when user has no access to target session", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    calculateGlobalBalances.mockResolvedValue({
      youOwe: [{ from: { userId: "user-1" }, to: { userId: "user-2" }, amount: 3000, sessionIds: ["session-1"] }],
      partnerBalances: [{ partner: { userId: "user-2" }, partnerName: "Maria", net: -3000, sessionBreakdown: [{ sessionId: "session-1", sessionName: "Viaje", net: -3000 }] }],
      theyOwe: [], totalYouOwe: 3000, totalTheyOwe: 0,
    });
    db.query.split_sessions.findFirst.mockResolvedValue({ id: "session-1", name: "Viaje" });
    db.query.split_session_members.findFirst.mockResolvedValue(null);
    const response = await POST(makeReq({ payeeUserId: "user-2", amount: 1200 }));
    expect(response.status).toBe(403);
  });

  it("records a payment, returns remaining debt and notifies the creditor", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    calculateGlobalBalances.mockResolvedValue({
      youOwe: [{ from: { userId: "user-1" }, to: { userId: "user-2" }, amount: 3000, sessionIds: ["session-1"] }],
      partnerBalances: [{ partner: { userId: "user-2" }, partnerName: "Maria", net: -3000, sessionBreakdown: [{ sessionId: "session-1", sessionName: "Viaje", net: -3000 }] }],
      theyOwe: [], totalYouOwe: 3000, totalTheyOwe: 0,
    });
    db.query.split_sessions.findFirst.mockResolvedValue({ id: "session-1", name: "Viaje" });
    db.query.split_session_members.findFirst.mockResolvedValue({ session_id: "session-1", user_id: "user-1" });
    db.query.users.findFirst.mockResolvedValue({ id: "user-1", username: "esteban", name: "Esteban" });
    db.insert.mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
    const response = await POST(makeReq({ payeeUserId: "user-2", amount: 1200 }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, remainingDebt: 1800, recordedAmount: 1200, sessionId: "session-1" });
    expect(notifySplitPaymentReceived).toHaveBeenCalledWith("user-2", "esteban", 1200, 1800, "Viaje");
  });
});
