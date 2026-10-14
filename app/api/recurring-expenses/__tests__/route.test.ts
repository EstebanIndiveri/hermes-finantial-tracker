import { NextRequest } from "next/server";
import { GET, POST } from "../route";

const mockVerifySession = jest.fn();
const mockMembership = jest.fn();
const mockList = jest.fn();
const mockCreate = jest.fn();
const mockStats = jest.fn();

jest.mock("@/lib/auth/session", () => ({ verifySession: (...args: unknown[]) => mockVerifySession(...args) }));
jest.mock("@/lib/groups/permissions", () => ({ getGroupMembership: (...args: unknown[]) => mockMembership(...args) }));
jest.mock("@/lib/db/recurring-queries", () => ({
  getUserRecurringExpenses: (...args: unknown[]) => mockList(...args),
  createRecurringExpense: (...args: unknown[]) => mockCreate(...args),
  getRecurringStats: (...args: unknown[]) => mockStats(...args),
}));

function request(method: "GET" | "POST", url = "http://localhost/api/recurring-expenses?stats=true", body?: object) {
  const req = new NextRequest(url, {
    method,
    headers: { "x-group-id": "web-group", "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  req.cookies.set("hermes_session", "valid-session");
  return req;
}

describe("recurring web group boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifySession.mockResolvedValue("user-1");
    mockMembership.mockResolvedValue({ group_id: "web-group", user_id: "user-1" });
    mockList.mockResolvedValue([]);
    mockStats.mockResolvedValue({ totalActive: 0 });
    mockCreate.mockResolvedValue({ id: "rec-1", groupId: "web-group" });
  });

  it("lists and calculates stats only for the selected web group, ignoring a caller groupId", async () => {
    const response = await GET(request("GET", "http://localhost/api/recurring-expenses?stats=true&groupId=other-group"));
    expect(response.status).toBe(200);
    expect(mockMembership).toHaveBeenCalledWith("user-1", "web-group");
    expect(mockList).toHaveBeenCalledWith("user-1", { activeOnly: false, groupId: "web-group" });
    expect(mockStats).toHaveBeenCalledWith("user-1", "web-group", undefined);
  });

  it("creates in the selected web group, never the active Telegram group", async () => {
    const response = await POST(request("POST", "http://localhost/api/recurring-expenses", {
      name: "Netflix", amountArs: 3000, dayOfMonth: 18,
    }));
    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", groupId: "web-group", name: "Netflix" }));
  });

  it("fails closed when the selected group is no longer a membership", async () => {
    mockMembership.mockResolvedValue(null);
    const response = await GET(request("GET"));
    expect(response.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });
});
