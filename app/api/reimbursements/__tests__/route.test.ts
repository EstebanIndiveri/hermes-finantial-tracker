import { GET, POST } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/session", () => ({
  verifySession: jest.fn(),
}));

jest.mock("@/lib/reimbursements/requests", () => ({
  getReimbursementsByUser: jest.fn(),
  createReimbursementWithNotifications: jest.fn(),
}));

const { verifySession } = require("@/lib/auth/session");
const {
  getReimbursementsByUser,
  createReimbursementWithNotifications,
} = require("@/lib/reimbursements/requests");

function makeReq(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(url, options);
}

describe("GET /api/reimbursements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    verifySession.mockResolvedValue(null);

    const response = await GET(makeReq("http://localhost/api/reimbursements"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns reimbursements for the authenticated user", async () => {
    verifySession.mockResolvedValue({ userId: "user-1" });
    getReimbursementsByUser.mockResolvedValue([{ id: "reimb-1" }]);

    const response = await GET(makeReq("http://localhost/api/reimbursements"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: "reimb-1" }]);
    expect(getReimbursementsByUser).toHaveBeenCalledWith("user-1");
  });
});

describe("POST /api/reimbursements", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    verifySession.mockResolvedValue(null);

    const response = await POST(
      makeReq("http://localhost/api/reimbursements", {
        method: "POST",
        body: JSON.stringify({ transactionId: "tx-1", amount: 100 }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when transactionId is missing", async () => {
    verifySession.mockResolvedValue({ userId: "user-1" });

    const response = await POST(
      makeReq("http://localhost/api/reimbursements", {
        method: "POST",
        body: JSON.stringify({ amount: 100 }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "transactionId and positive amount required",
    });
  });

  it("returns 400 when amount is not a positive number", async () => {
    verifySession.mockResolvedValue({ userId: "user-1" });

    const response = await POST(
      makeReq("http://localhost/api/reimbursements", {
        method: "POST",
        body: JSON.stringify({ transactionId: "tx-1", amount: 0 }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "transactionId and positive amount required",
    });
  });

  it("creates a reimbursement request for the authenticated user", async () => {
    verifySession.mockResolvedValue({ userId: "user-1" });
    createReimbursementWithNotifications.mockResolvedValue({ id: "reimb-1", amount: 100 });

    const response = await POST(
      makeReq("http://localhost/api/reimbursements", {
        method: "POST",
        body: JSON.stringify({ transactionId: "tx-1", amount: 100, payerId: "payer-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "reimb-1", amount: 100 });
    expect(createReimbursementWithNotifications).toHaveBeenCalledWith("tx-1", "user-1", 100, "payer-1");
  });
});
