import { GET } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { fetchRipioRate, RipioFetchError } from "@/lib/exchange/ripio";

jest.mock("@/lib/db/client", () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(),
      })),
    })),
  },
}));

jest.mock("@/lib/exchange/ripio", () => ({
  fetchRipioRate: jest.fn(),
  RipioFetchError: class RipioFetchError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "RipioFetchError";
    }
  },
}));

jest.mock("@/lib/utils/dates", () => ({
  getActiveMonthArgentina: jest.fn(() => "2025-05"),
}));

describe("GET /api/cron/update-exchange-rate", () => {
  const mockEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...mockEnv, CRON_SECRET: "test-secret-123" };
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([]),
      })),
    });
  });

  afterEach(() => {
    process.env = mockEnv;
  });

  test("returns 401 without authorization header", async () => {
    const req = new NextRequest("http://localhost:3000/api/cron/update-exchange-rate");
    const response = await GET(req);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("returns 401 with incorrect bearer token", async () => {
    const req = new NextRequest("http://localhost:3000/api/cron/update-exchange-rate");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "authorization" ? "Bearer wrong-token" : null),
    });
    const response = await GET(req);
    expect(response.status).toBe(401);
  });

  test("returns 503 when Ripio fetch fails with RipioFetchError", async () => {
    (fetchRipioRate as jest.Mock).mockRejectedValue(new RipioFetchError("API unavailable"));

    const req = new NextRequest("http://localhost:3000/api/cron/update-exchange-rate");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "authorization" ? "Bearer test-secret-123" : null),
    });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("RIPIO_UNAVAILABLE");
    expect(data.message).toBe("API unavailable");
  });

  test("returns 503 when Ripio throws unknown error", async () => {
    (fetchRipioRate as jest.Mock).mockRejectedValue(new Error("Network error"));

    const req = new NextRequest("http://localhost:3000/api/cron/update-exchange-rate");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "authorization" ? "Bearer test-secret-123" : null),
    });

    const response = await GET(req);
    const data = await response.json();

    expect(data.error).toBe("RIPIO_UNAVAILABLE");
    expect(data.message).toBe("Unknown error");
  });

  test("updates all existing groups' settings when Ripio succeeds", async () => {
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ id: "s1" }, { id: "s2" }]),
      })),
    });
    (fetchRipioRate as jest.Mock).mockResolvedValue(1250.75);

    const req = new NextRequest("http://localhost:3000/api/cron/update-exchange-rate");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "authorization" ? "Bearer test-secret-123" : null),
    });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.rate).toBe(1250.75);
    expect(data.month).toBe("2025-05");
    expect(data.updated).toBe(2);
    expect(db.update).toHaveBeenCalled();
  });

  test("returns ok with updated:0 when no settings exist", async () => {
    (fetchRipioRate as jest.Mock).mockResolvedValue(1250.75);

    const req = new NextRequest("http://localhost:3000/api/cron/update-exchange-rate");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "authorization" ? "Bearer test-secret-123" : null),
    });

    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.updated).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
  });

  test("sets exchange_rate_source to ripio on update", async () => {
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({
        where: jest.fn().mockResolvedValue([{ id: "s1" }]),
      })),
    });
    (fetchRipioRate as jest.Mock).mockResolvedValue(1200);

    const req = new NextRequest("http://localhost:3000/api/cron/update-exchange-rate");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "authorization" ? "Bearer test-secret-123" : null),
    });

    await GET(req);
    expect(db.update).toHaveBeenCalled();
  });
});
