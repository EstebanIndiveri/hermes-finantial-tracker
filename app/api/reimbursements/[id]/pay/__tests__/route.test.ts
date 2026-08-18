import { POST } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/session", () => ({
  verifySession: jest.fn(),
}));

jest.mock("@/lib/reimbursements/requests", () => ({
  getReimbursementById: jest.fn(),
  markReimbursementAsPaid: jest.fn(),
}));

const { verifySession } = require("@/lib/auth/session");
const {
  getReimbursementById,
  markReimbursementAsPaid,
} = require("@/lib/reimbursements/requests");

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: "POST" });
}

describe("POST /api/reimbursements/[id]/pay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    verifySession.mockResolvedValue(null);

    const response = await POST(makeReq("http://localhost/api/reimbursements/reimb-1/pay"), {
      params: { id: "reimb-1" },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when the reimbursement does not exist", async () => {
    verifySession.mockResolvedValue({ userId: "payer-1" });
    getReimbursementById.mockResolvedValue(null);

    const response = await POST(makeReq("http://localhost/api/reimbursements/reimb-1/pay"), {
      params: { id: "reimb-1" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Reimbursement not found" });
  });

  it("returns 403 when the authenticated user is not the payer", async () => {
    verifySession.mockResolvedValue({ userId: "user-1" });
    getReimbursementById.mockResolvedValue({ payerId: "payer-1", status: "pending" });

    const response = await POST(makeReq("http://localhost/api/reimbursements/reimb-1/pay"), {
      params: { id: "reimb-1" },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Not authorized to pay this reimbursement",
    });
  });

  it("returns 400 when the reimbursement is not pending", async () => {
    verifySession.mockResolvedValue({ userId: "payer-1" });
    getReimbursementById.mockResolvedValue({ payerId: "payer-1", status: "paid" });

    const response = await POST(makeReq("http://localhost/api/reimbursements/reimb-1/pay"), {
      params: { id: "reimb-1" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Reimbursement is not pending" });
  });

  it("returns 500 when marking the reimbursement as paid fails", async () => {
    verifySession.mockResolvedValue({ userId: "payer-1" });
    getReimbursementById.mockResolvedValue({ payerId: "payer-1", status: "pending" });
    markReimbursementAsPaid.mockResolvedValue(false);

    const response = await POST(makeReq("http://localhost/api/reimbursements/reimb-1/pay"), {
      params: { id: "reimb-1" },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to mark as paid" });
  });

  it("marks the reimbursement as paid for the payer", async () => {
    verifySession.mockResolvedValue({ userId: "payer-1" });
    getReimbursementById.mockResolvedValue({ payerId: "payer-1", status: "pending" });
    markReimbursementAsPaid.mockResolvedValue(true);

    const response = await POST(makeReq("http://localhost/api/reimbursements/reimb-1/pay"), {
      params: { id: "reimb-1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(markReimbursementAsPaid).toHaveBeenCalledWith("reimb-1", "payer-1");
  });
});
