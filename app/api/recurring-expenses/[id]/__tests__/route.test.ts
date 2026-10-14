import { DELETE } from "../route";
import { NextRequest } from "next/server";

const mockVerifySession = jest.fn();
const mockGetRecurringExpenseById = jest.fn();
const mockDeleteRecurringExpense = jest.fn();
const mockMembership = jest.fn();

jest.mock("@/lib/auth/session", () => ({
  verifySession: (...args: unknown[]) => mockVerifySession(...args),
}));
jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: (...args: unknown[]) => mockMembership(...args),
}));

jest.mock("@/lib/db/recurring-queries", () => ({
  getRecurringExpenseById: (...args: unknown[]) => mockGetRecurringExpenseById(...args),
  updateRecurringExpense: jest.fn(),
  deleteRecurringExpense: (...args: unknown[]) => mockDeleteRecurringExpense(...args),
  toggleRecurringExpense: jest.fn(),
}));

describe("DELETE /api/recurring-expenses/[id]", () => {
  const params = { params: Promise.resolve({ id: "rec-1" }) };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembership.mockResolvedValue({ group_id: "group-1", user_id: "user-1" });
  });

  function makeRequest() {
    const request = new NextRequest("http://localhost:3000/api/recurring-expenses/rec-1", {
      method: "DELETE",
      headers: { "x-group-id": "group-1" },
    });
    request.cookies.set("hermes_session", "valid-session");
    return request;
  }

  it("returns 401 when session is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/recurring-expenses/rec-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, params);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No autorizado" });
  });

  it("returns 404 when recurring expense does not exist", async () => {
    mockVerifySession.mockResolvedValue("user-1");
    mockGetRecurringExpenseById.mockResolvedValue(null);

    const response = await DELETE(makeRequest(), params);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Gasto recurrente no encontrado" });
  });

  it("returns 403 when recurring expense belongs to another user", async () => {
    mockVerifySession.mockResolvedValue("user-1");
    mockGetRecurringExpenseById.mockResolvedValue({ id: "rec-1", userId: "user-2", name: "Netflix" });

    const response = await DELETE(makeRequest(), params);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "No autorizado" });
  });

  it("deletes the recurring expense and returns success", async () => {
    mockVerifySession.mockResolvedValue("user-1");
    mockGetRecurringExpenseById.mockResolvedValue({ id: "rec-1", userId: "user-1", groupId: "group-1", name: "Netflix" });
    mockDeleteRecurringExpense.mockResolvedValue(true);

    const response = await DELETE(makeRequest(), params);

    expect(response.status).toBe(200);
    expect(mockDeleteRecurringExpense).toHaveBeenCalledWith("rec-1");
    expect(await response.json()).toEqual({ success: true });
  });

  it("does not delete a recurrence owned by this user in another group", async () => {
    mockVerifySession.mockResolvedValue("user-1");
    mockGetRecurringExpenseById.mockResolvedValue({ id: "rec-1", userId: "user-1", groupId: "group-2", name: "Netflix" });
    const response = await DELETE(makeRequest(), params);
    expect(response.status).toBe(403);
    expect(mockDeleteRecurringExpense).not.toHaveBeenCalled();
  });
});
