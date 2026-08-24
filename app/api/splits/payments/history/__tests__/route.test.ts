import { GET } from "../route";
import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { getPaymentHistoryForUser } from "@/lib/splits/payment-history";

jest.mock("@/lib/auth/session", () => ({
  verifySession: jest.fn(),
}));

jest.mock("@/lib/splits/payment-history", () => ({
  getPaymentHistoryForUser: jest.fn(),
}));

function makeReq(url: string, options?: RequestInit): NextRequest {
  const headers = new Headers(options?.headers);
  headers.set("cookie", "hermes_session=session-token");
  return new NextRequest(url, { ...options, headers });
}

describe("GET /api/splits/payments/history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    (verifySession as jest.Mock).mockResolvedValue(null);

    const response = await GET(makeReq("http://localhost/api/splits/payments/history"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when from is invalid", async () => {
    (verifySession as jest.Mock).mockResolvedValue("user-1");

    const response = await GET(makeReq("http://localhost/api/splits/payments/history?from=invalid-date"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Parámetros inválidos" });
  });

  it("returns payment history with parsed filters", async () => {
    (verifySession as jest.Mock).mockResolvedValue("user-1");
    (getPaymentHistoryForUser as jest.Mock).mockResolvedValue({
      items: [
        {
          id: "pay-1",
          date: 1724486400000,
          amount: 2500,
          partnerId: "user-2",
          partnerName: "Ana",
          sessionId: "session-1",
          sessionName: "Cena",
          direction: "sent",
        },
      ],
      total: 1,
    });

    const response = await GET(
      makeReq(
        "http://localhost/api/splits/payments/history?partnerId=user-2&from=2026-08-01&to=2026-08-31&limit=10&offset=20",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: "pay-1",
          date: 1724486400000,
          amount: 2500,
          partnerId: "user-2",
          partnerName: "Ana",
          sessionId: "session-1",
          sessionName: "Cena",
          direction: "sent",
        },
      ],
      total: 1,
      limit: 10,
      offset: 20,
    });
    expect(getPaymentHistoryForUser).toHaveBeenCalledWith("user-1", {
      partnerId: "user-2",
      from: "2026-08-01",
      to: "2026-08-31",
      limit: 10,
      offset: 20,
    });
  });
});
