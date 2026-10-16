import { NextRequest } from "next/server";

jest.mock("@/lib/auth/session", () => ({ verifySession: jest.fn() }));
jest.mock("@/lib/splits/global-balances", () => ({ calculateGlobalBalances: jest.fn() }));
jest.mock("@/lib/db/client", () => ({
  db: {
    insert: jest.fn(),
    query: {
      split_payments: { findFirst: jest.fn() },
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

const operationId = "c90237d7-f355-4380-b7cc-6e0a2db479bc";

describe("POST /api/splits/payments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.split_payments.findFirst.mockResolvedValue(null);
  });

  it("returns 401 when the user is not authenticated", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue(null);
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", amount: 1000 }));
    expect(response.status).toBe(401);
  });

  it("returns 400 when amount is invalid", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", amount: 0 }));
    expect(response.status).toBe(400);
  });

  it("returns 404 when no matching debt exists", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    calculateGlobalBalances.mockResolvedValue({ youOwe: [], partnerBalances: [], theyOwe: [], totalYouOwe: 0, totalTheyOwe: 0 });
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", amount: 1000 }));
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
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", amount: 2000 }));
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
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", amount: 1200 }));
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
    db.insert.mockReturnValue({ values: jest.fn().mockReturnValue({ onConflictDoNothing: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: "payment-1" }]) }) }) });
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", amount: 1200 }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, remainingDebt: 1800, recordedAmount: 1200, sessionId: "session-1" });
    expect(db.insert.mock.results[0].value.values).toHaveBeenCalledWith(expect.objectContaining({ operation_id: operationId }));
    expect(notifySplitPaymentReceived).toHaveBeenCalledWith("user-2", "esteban", 1200, 1800, "Viaje");
  });

  it("requires an operation UUID before checking debt or writing", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    const response = await POST(makeReq({ payeeUserId: "user-2", amount: 1200 }));
    expect(response.status).toBe(400);
    expect(calculateGlobalBalances).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("replays the same persisted payment without a second insert or notification", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    db.query.split_payments.findFirst.mockResolvedValue({
      operation_id: operationId, payer_user_id: "user-1", payee_user_id: "user-2",
      payer_temp_id: null, payee_temp_id: null, session_id: "session-1", amount: 1200,
    });
    db.query.split_session_members.findFirst.mockResolvedValue({ session_id: "session-1", user_id: "user-1" });
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", sessionId: "session-1", amount: 1200 }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, replayed: true, recordedAmount: 1200 });
    expect(db.insert).not.toHaveBeenCalled();
    expect(notifySplitPaymentReceived).not.toHaveBeenCalled();
  });

  it("rejects a reused UUID with changed payment data", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    db.query.split_payments.findFirst.mockResolvedValue({
      operation_id: operationId, payer_user_id: "user-1", payee_user_id: "user-2",
      payer_temp_id: null, payee_temp_id: null, session_id: "session-1", amount: 1200,
    });
    db.query.split_session_members.findFirst.mockResolvedValue({ session_id: "session-1", user_id: "user-1" });
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", sessionId: "session-1", amount: 1300 }));
    expect(response.status).toBe(409);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does not reveal another session's payment on replay", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    db.query.split_payments.findFirst.mockResolvedValue({
      operation_id: operationId, payer_user_id: "user-1", payer_temp_id: null,
      payee_user_id: "user-2", payee_temp_id: null, session_id: "session-1", amount: 1200,
    });
    db.query.split_session_members.findFirst.mockResolvedValue(null);
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", amount: 1200 }));
    expect(response.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("treats a concurrent insert with the same key as a replay", async () => {
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    calculateGlobalBalances.mockResolvedValue({
      youOwe: [{ from: { userId: "user-1" }, to: { userId: "user-2" }, amount: 3000, sessionIds: ["session-1"] }],
      partnerBalances: [{ partner: { userId: "user-2" }, net: -3000, sessionBreakdown: [{ sessionId: "session-1", net: -3000 }] }],
      theyOwe: [], totalYouOwe: 3000, totalTheyOwe: 0,
    });
    db.query.split_sessions.findFirst.mockResolvedValue({ id: "session-1", name: "Viaje" });
    db.query.split_session_members.findFirst.mockResolvedValue({ session_id: "session-1", user_id: "user-1" });
    db.query.split_payments.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        operation_id: operationId, payer_user_id: "user-1", payer_temp_id: null,
        payee_user_id: "user-2", payee_temp_id: null, session_id: "session-1", amount: 1200,
      });
    db.insert.mockReturnValue({ values: jest.fn().mockReturnValue({ onConflictDoNothing: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) }) }) });
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", amount: 1200 }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ replayed: true });
    expect(notifySplitPaymentReceived).not.toHaveBeenCalled();
  });

  it("returns success when Telegram fails after the payment commit", async () => {
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("../route");
    verifySession.mockResolvedValue("user-1");
    calculateGlobalBalances.mockResolvedValue({
      youOwe: [{ from: { userId: "user-1" }, to: { userId: "user-2" }, amount: 3000, sessionIds: ["session-1"] }],
      partnerBalances: [{ partner: { userId: "user-2" }, net: -3000, sessionBreakdown: [{ sessionId: "session-1", net: -3000 }] }],
      theyOwe: [], totalYouOwe: 3000, totalTheyOwe: 0,
    });
    db.query.split_sessions.findFirst.mockResolvedValue({ id: "session-1", name: "Viaje" });
    db.query.split_session_members.findFirst.mockResolvedValue({ session_id: "session-1", user_id: "user-1" });
    db.query.users.findFirst.mockResolvedValue({ id: "user-1", username: "esteban" });
    db.insert.mockReturnValue({ values: jest.fn().mockReturnValue({ onConflictDoNothing: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: "payment-1" }]) }) }) });
    notifySplitPaymentReceived.mockRejectedValue(new Error("Telegram unavailable"));
    const response = await POST(makeReq({ operationId, payeeUserId: "user-2", amount: 1200 }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, notificationFailed: true });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith("Split payment notification failed after commit", { operationId });
    errorLog.mockRestore();
  });
});
