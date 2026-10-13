import { NextRequest } from "next/server";
import { GET, PATCH } from "../route";
import { verifySession } from "@/lib/utils/session";
import { getProactivePreferences, setProactivePreference } from "@/lib/notifications/proactive-consent";

jest.mock("@/lib/utils/session", () => ({ verifySession: jest.fn() }));
jest.mock("@/lib/notifications/proactive-consent", () => ({
  getProactivePreferences: jest.fn(),
  setProactivePreference: jest.fn(),
}));

function request(method: "GET" | "PATCH", body?: unknown, cookie = "hermes_session=signed") {
  return new NextRequest("http://localhost/api/notifications/preferences", {
    method,
    headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(verifySession).mockResolvedValue("user-A");
  jest.mocked(getProactivePreferences).mockResolvedValue({
    dailySummary: false, recurring: false, reimbursements: false,
  });
});

it("requires a signed session for reads and writes", async () => {
  expect((await GET(request("GET", undefined, ""))).status).toBe(401);
  expect((await PATCH(request("PATCH", { kind: "dailySummary", enabled: true }, ""))).status).toBe(401);
  expect(getProactivePreferences).not.toHaveBeenCalled();
  expect(setProactivePreference).not.toHaveBeenCalled();
});

it("returns default-off preferences only for the session user", async () => {
  const response = await GET(request("GET"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ dailySummary: false, recurring: false, reimbursements: false });
  expect(getProactivePreferences).toHaveBeenCalledWith("user-A");
});

it("rejects implicit enablement, extra fields and session-user substitution", async () => {
  for (const body of [
    { kind: "dailySummary", enabled: "true" },
    { kind: "sessions", enabled: true },
    { kind: "recurring", enabled: true, userId: "user-B" },
    { enabled: true },
  ]) {
    expect((await PATCH(request("PATCH", body))).status).toBe(400);
  }
  expect(setProactivePreference).not.toHaveBeenCalled();
});

it("updates one preference for the signed-in user and supports revocation", async () => {
  jest.mocked(setProactivePreference)
    .mockResolvedValueOnce({ dailySummary: false, recurring: true, reimbursements: false })
    .mockResolvedValueOnce({ dailySummary: false, recurring: false, reimbursements: false });

  const enabled = await PATCH(request("PATCH", { kind: "recurring", enabled: true }));
  expect(await enabled.json()).toEqual({ dailySummary: false, recurring: true, reimbursements: false });
  const disabled = await PATCH(request("PATCH", { kind: "recurring", enabled: false }));
  expect(await disabled.json()).toEqual({ dailySummary: false, recurring: false, reimbursements: false });
  expect(setProactivePreference).toHaveBeenNthCalledWith(1, "user-A", "recurring", true);
  expect(setProactivePreference).toHaveBeenNthCalledWith(2, "user-A", "recurring", false);
});
