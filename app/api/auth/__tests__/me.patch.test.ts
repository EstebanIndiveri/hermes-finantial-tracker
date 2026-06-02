import { PATCH } from "../me/route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { signSession } from "@/lib/utils/session";

jest.mock("@/lib/db/client", () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
      },
    },
    update: jest.fn(),
  },
}));

const mockUpdate = db.update as jest.MockedFunction<typeof db.update>;

process.env.SESSION_SECRET = "test-secret-32-chars-long-padding!!";

function makeRequest(body: Record<string, unknown>, cookie = "valid-session"): NextRequest {
  return new NextRequest("http://localhost/api/auth/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      cookie: `hermes_session=${cookie}`,
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/auth/me", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no valid session", async () => {
    const res = await PATCH(makeRequest({ onboarding_completed: true }, "invalid-cookie"));
    expect(res.status).toBe(401);
  });

  it("marks onboarding as completed when onboarding_completed is true", async () => {
    const mockSet = jest.fn().mockReturnThis();
    const mockWhere = jest.fn().mockResolvedValue(undefined);
    mockUpdate.mockReturnValue({ set: mockSet } as any);
    mockSet.mockReturnValue({ where: mockWhere });

    // Mock findFirst to return a user
    const mockDb = db as any;
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: "user-123" });

    // Create a valid session cookie
    const cookie = await signSession("user-123");
    const res = await PATCH(makeRequest({ onboarding_completed: true }, cookie));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 400 for invalid body (missing onboarding_completed)", async () => {
    const cookie = await signSession("user-123");
    const res = await PATCH(makeRequest({}, cookie));
    expect(res.status).toBe(400);
  });

  it("updates display name when name is provided", async () => {
    const mockSet = jest.fn().mockReturnThis();
    const mockWhere = jest.fn().mockResolvedValue(undefined);
    mockUpdate.mockReturnValue({ set: mockSet } as any);
    mockSet.mockReturnValue({ where: mockWhere });

    const mockDb = db as any;
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: "user-123" });

    const cookie = await signSession("user-123");
    const res = await PATCH(makeRequest({ name: "Nuevo Nombre" }, cookie));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 400 when name is empty string", async () => {
    const mockDb = db as any;
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: "user-123" });

    const cookie = await signSession("user-123");
    const res = await PATCH(makeRequest({ name: "" }, cookie));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body has neither onboarding_completed nor name", async () => {
    const mockDb = db as any;
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: "user-123" });

    const cookie = await signSession("user-123");
    const res = await PATCH(makeRequest({}, cookie));
    expect(res.status).toBe(400);
  });
});
