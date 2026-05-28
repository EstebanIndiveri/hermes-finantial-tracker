import { GET } from "../route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { fetchRipioRate, RipioFetchError } from "@/lib/exchange/ripio";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
      },
      monthly_settings: {
        findFirst: jest.fn(),
      },
    },
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(),
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

  test("returns 500 when no user exists", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/cron/update-exchange-rate");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "authorization" ? "Bearer test-secret-123" : null),
    });

    const response = await GET(req);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("No user");
  });

  test("returns error response when Ripio fetch fails", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-123" });
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      exchange_rate: 1100,
      exchange_rate_updated_at: Date.now() - 86400000,
    });
    (fetchRipioRate as jest.Mock).mockRejectedValue(new RipioFetchError("API unavailable"));

    const req = new NextRequest("http://localhost:3000/api/cron/update-exchange-rate");
    Object.defineProperty(req.headers, "get", {
      value: jest.fn((key: string) => key === "authorization" ? "Bearer test-secret-123" : null),
    });

    const response = await GET(req);
    const data = await response.json();

    expect(data.error).toBe("RIPIO_UNAVAILABLE");
    expect(data.message).toBe("API unavailable");
    expect(data.lastRate).toBe(1100);
  });

  test("returns error response when Ripio throws unknown error", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-123" });
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);
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

  test("creates new settings when none exist and Ripio succeeds", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-123" });
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue(null);
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
    expect(db.insert).toHaveBeenCalled();
  });

  test("updates existing settings when Ripio succeeds", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-123" });
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      user_id: "user-123",
      month: "2025-05",
      exchange_rate: 1100,
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
    expect(db.update).toHaveBeenCalled();
  });

  test("sets exchange_rate_source to ripio", async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: "user-123" });
    (db.query.monthly_settings.findFirst as jest.Mock).mockResolvedValue({
      id: "setting-123",
      user_id: "user-123",
      month: "2025-05",
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
