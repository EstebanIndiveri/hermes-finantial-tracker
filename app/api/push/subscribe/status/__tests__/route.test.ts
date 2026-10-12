import { NextRequest } from "next/server";
import { POST } from "../route";

jest.mock("@/lib/auth/session", () => ({ verifySession: jest.fn() }));
jest.mock("@/lib/notifications/web-push", () => ({ isSubscriptionOwnedByUser: jest.fn() }));

const { verifySession } = require("@/lib/auth/session");
const { isSubscriptionOwnedByUser } = require("@/lib/notifications/web-push");

function request(body: unknown, authenticated = true): NextRequest {
  return new NextRequest("http://localhost/api/push/subscribe/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: "hermes_session=session-token" } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  verifySession.mockResolvedValue("user-1");
});

it("requires an authenticated session without querying ownership", async () => {
  const response = await POST(request({ endpoint: "https://push.test/one" }, false));
  expect(response.status).toBe(401);
  expect(isSubscriptionOwnedByUser).not.toHaveBeenCalled();
});

it("rejects a missing or oversized endpoint", async () => {
  for (const endpoint of [undefined, "", "x".repeat(4097)]) {
    const response = await POST(request({ endpoint }));
    expect(response.status).toBe(400);
  }
  expect(isSubscriptionOwnedByUser).not.toHaveBeenCalled();
});

it("returns only the current user's ownership, without exposing another user or endpoint", async () => {
  isSubscriptionOwnedByUser.mockResolvedValue(false);
  const response = await POST(request({ endpoint: "https://push.test/one" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ ownedByCurrentUser: false });
  expect(isSubscriptionOwnedByUser).toHaveBeenCalledWith("user-1", "https://push.test/one");

  isSubscriptionOwnedByUser.mockResolvedValue(true);
  const ownedResponse = await POST(request({ endpoint: "https://push.test/one" }));
  expect(await ownedResponse.json()).toEqual({ ownedByCurrentUser: true });
});
