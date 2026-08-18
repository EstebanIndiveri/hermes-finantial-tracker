import { DELETE, GET, POST } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/utils/session", () => ({
  verifySession: jest.fn(),
}));

jest.mock("@/lib/reimbursements/payment-info", () => ({
  getUserPaymentInfo: jest.fn(),
  addPaymentInfo: jest.fn(),
  deletePaymentInfo: jest.fn(),
}));

const { verifySession } = require("@/lib/utils/session");
const {
  addPaymentInfo,
  deletePaymentInfo,
  getUserPaymentInfo,
} = require("@/lib/reimbursements/payment-info");

function makeReq(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(url, options);
}

function withSession(req: NextRequest, cookie = "session-token"): NextRequest {
  req.cookies.set("hermes_session", cookie);
  return req;
}

describe("GET /api/user/payment-info", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    verifySession.mockResolvedValue(null);

    const response = await GET(makeReq("http://localhost/api/user/payment-info"));

    expect(response.status).toBe(401);
  });

  it("returns the authenticated user payment info", async () => {
    verifySession.mockResolvedValue("user-1");
    getUserPaymentInfo.mockResolvedValue([{ id: "pi-1" }]);

    const response = await GET(withSession(makeReq("http://localhost/api/user/payment-info")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: "pi-1" }]);
    expect(getUserPaymentInfo).toHaveBeenCalledWith("user-1");
  });
});

describe("POST /api/user/payment-info", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    verifySession.mockResolvedValue(null);

    const response = await POST(
      makeReq("http://localhost/api/user/payment-info", {
        method: "POST",
        body: JSON.stringify({ method: "cbu", value: "123" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when the payment method is invalid", async () => {
    verifySession.mockResolvedValue("user-1");

    const response = await POST(
      withSession(makeReq("http://localhost/api/user/payment-info", {
        method: "POST",
        body: JSON.stringify({ method: "crypto", value: "123" }),
      })),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when cbu or alias is missing a value", async () => {
    verifySession.mockResolvedValue("user-1");

    const response = await POST(
      withSession(makeReq("http://localhost/api/user/payment-info", {
        method: "POST",
        body: JSON.stringify({ method: "alias", value: "" }),
      })),
    );

    expect(response.status).toBe(400);
  });

  it("stores efectivo with a null value", async () => {
    verifySession.mockResolvedValue("user-1");
    addPaymentInfo.mockResolvedValue({ id: "pi-1", paymentMethod: "efectivo", value: null });

    const response = await POST(
      withSession(makeReq("http://localhost/api/user/payment-info", {
        method: "POST",
        body: JSON.stringify({ method: "efectivo", value: "ignored", isDefault: true }),
      })),
    );

    expect(response.status).toBe(200);
    expect(addPaymentInfo).toHaveBeenCalledWith("user-1", "efectivo", null, true);
  });

  it("stores cbu payment info for the authenticated user", async () => {
    verifySession.mockResolvedValue("user-1");
    addPaymentInfo.mockResolvedValue({ id: "pi-1", paymentMethod: "cbu", value: "123" });

    const response = await POST(
      withSession(makeReq("http://localhost/api/user/payment-info", {
        method: "POST",
        body: JSON.stringify({ method: "cbu", value: "123", isDefault: false }),
      })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "pi-1", paymentMethod: "cbu", value: "123" });
    expect(addPaymentInfo).toHaveBeenCalledWith("user-1", "cbu", "123", false);
  });
});

describe("DELETE /api/user/payment-info", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    verifySession.mockResolvedValue(null);

    const response = await DELETE(makeReq("http://localhost/api/user/payment-info?id=pi-1", { method: "DELETE" }));

    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    verifySession.mockResolvedValue("user-1");

    const response = await DELETE(withSession(makeReq("http://localhost/api/user/payment-info", { method: "DELETE" })));

    expect(response.status).toBe(400);
  });

  it("deletes payment info for the authenticated user", async () => {
    verifySession.mockResolvedValue("user-1");
    deletePaymentInfo.mockResolvedValue(true);

    const response = await DELETE(withSession(makeReq("http://localhost/api/user/payment-info?id=pi-1", { method: "DELETE" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(deletePaymentInfo).toHaveBeenCalledWith("pi-1", "user-1");
  });
});
