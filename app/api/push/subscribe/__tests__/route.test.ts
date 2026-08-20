import { DELETE, POST } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/session", () => ({
  verifySession: jest.fn(),
}));

jest.mock("@/lib/notifications/web-push", () => ({
  saveSubscription: jest.fn(),
  removeSubscription: jest.fn(),
}));

const { verifySession } = require("@/lib/auth/session");
const { saveSubscription, removeSubscription } = require("@/lib/notifications/web-push");

function makeReq(method: "POST" | "DELETE", body?: object, session?: string): NextRequest {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Cookie: `hermes_session=${session}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    verifySession.mockResolvedValue(null);

    const response = await POST(makeReq("POST", {
      subscription: {
        endpoint: "https://example.test/subscription",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      },
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when the subscription payload is incomplete", async () => {
    verifySession.mockResolvedValue("user-1");

    const response = await POST(makeReq("POST", { subscription: { endpoint: "https://example.test/subscription" } }, "session-token"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid subscription" });
  });

  it("stores the subscription for the authenticated user", async () => {
    verifySession.mockResolvedValue("user-1");

    const response = await POST(makeReq("POST", {
      subscription: {
        endpoint: "https://example.test/subscription",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      },
    }, "session-token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(saveSubscription).toHaveBeenCalledWith("user-1", {
      endpoint: "https://example.test/subscription",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });
  });
});

describe("DELETE /api/push/subscribe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    verifySession.mockResolvedValue(null);

    const response = await DELETE(makeReq("DELETE", { endpoint: "https://example.test/subscription" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when endpoint is missing", async () => {
    verifySession.mockResolvedValue("user-1");

    const response = await DELETE(makeReq("DELETE", {}, "session-token"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Endpoint required" });
  });

  it("removes the subscription for the authenticated user", async () => {
    verifySession.mockResolvedValue("user-1");

    const response = await DELETE(
      makeReq("DELETE", { endpoint: "https://example.test/subscription" }, "session-token"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(removeSubscription).toHaveBeenCalledWith("https://example.test/subscription");
  });
});
