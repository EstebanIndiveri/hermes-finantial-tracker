import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { notifySplitPaymentReceived } from "@/lib/notifications/telegram";
import { recordManualSplitPayment } from "@/lib/splits/record-payment";

jest.mock("@/lib/auth/session", () => ({ verifySession: jest.fn() }));
jest.mock("@/lib/db/client", () => ({ db: { query: { users: { findFirst: jest.fn() } } } }));
jest.mock("@/lib/notifications/telegram", () => ({ notifySplitPaymentReceived: jest.fn() }));
jest.mock("@/lib/splits/record-payment", () => ({ recordManualSplitPayment: jest.fn() }));

const operationId = "c90237d7-f355-4380-b7cc-6e0a2db479bc";
const validBody = { operationId, sessionId: "session-1", payeeUserId: "user-2", amount: 1200 };

function makeReq(body: object, cookie = "session-token"): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.set("cookie", `hermes_session=${cookie}`);
  return new NextRequest("http://localhost/api/splits/payments", {
    method: "POST", headers, body: JSON.stringify(body),
  });
}

describe("POST /api/splits/payments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifySession as jest.Mock).mockResolvedValue("user-1");
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-1", username: "esteban" });
    (notifySplitPaymentReceived as jest.Mock).mockResolvedValue(undefined);
    (recordManualSplitPayment as jest.Mock).mockResolvedValue({
      payment: { id: "payment-1" }, replayed: false, remainingDebt: 1800, sessionName: "Viaje",
    });
  });

  it("rejects unauthenticated requests before the writer", async () => {
    const { POST } = await import("../route");
    (verifySession as jest.Mock).mockResolvedValue(null);
    expect((await POST(makeReq(validBody))).status).toBe(401);
    expect(recordManualSplitPayment).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validBody, amount: 0 }],
    [{ ...validBody, amount: 0.001 }],
    [{ ...validBody, operationId: undefined }],
    [{ ...validBody, sessionId: undefined }],
    [{ ...validBody, payeeUserId: undefined }],
    [{ ...validBody, payeeTempId: "temp-1" }],
  ])("rejects invalid or unsupported input before the writer", async (body) => {
    const { POST } = await import("../route");
    expect((await POST(makeReq(body))).status).toBe(400);
    expect(recordManualSplitPayment).not.toHaveBeenCalled();
  });

  it("rejects a self-payment before the writer", async () => {
    const { POST } = await import("../route");
    expect((await POST(makeReq({ ...validBody, payeeUserId: "user-1" }))).status).toBe(400);
    expect(recordManualSplitPayment).not.toHaveBeenCalled();
  });

  it.each([
    [{ error: "Not found", status: 404 }, 404],
    [{ error: "Forbidden", status: 403 }, 403],
    [{ error: "Creditor outside session", status: 400 }, 400],
    [{ error: "Payment exceeds outstanding debt", status: 400 }, 400],
    [{ error: "Operation key already used", status: 409 }, 409],
  ])("passes transactional rejection through without notification", async (result, status) => {
    const { POST } = await import("../route");
    (recordManualSplitPayment as jest.Mock).mockResolvedValue(result);
    expect((await POST(makeReq(validBody))).status).toBe(status);
    expect(notifySplitPaymentReceived).not.toHaveBeenCalled();
  });

  it("records a payment and notifies only after the writer succeeds", async () => {
    const { POST } = await import("../route");
    const response = await POST(makeReq(validBody));
    expect(recordManualSplitPayment).toHaveBeenCalledWith({
      operationId, sessionId: "session-1", actorId: "user-1", payeeUserId: "user-2", amount: 1200,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true, replayed: false, remainingDebt: 1800, recordedAmount: 1200,
    });
    expect(notifySplitPaymentReceived).toHaveBeenCalledWith("user-2", "esteban", 1200, 1800, "Viaje");
  });

  it("replays without a second notification", async () => {
    const { POST } = await import("../route");
    (recordManualSplitPayment as jest.Mock).mockResolvedValue({
      payment: { id: "payment-1" }, replayed: true, remainingDebt: null, sessionName: "Viaje",
    });
    const response = await POST(makeReq(validBody));
    await expect(response.json()).resolves.toMatchObject({ success: true, replayed: true });
    expect(notifySplitPaymentReceived).not.toHaveBeenCalled();
  });

  it("reports a notification failure without rolling back the payment", async () => {
    const errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { POST } = await import("../route");
      (notifySplitPaymentReceived as jest.Mock).mockRejectedValue(new Error("Telegram unavailable"));
      const response = await POST(makeReq(validBody));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ success: true, notificationFailed: true });
      expect(recordManualSplitPayment).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith("Split payment notification failed after commit", { operationId });
    } finally {
      errorLog.mockRestore();
    }
  });
});
