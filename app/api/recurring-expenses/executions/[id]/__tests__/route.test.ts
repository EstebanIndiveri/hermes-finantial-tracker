import { NextRequest } from "next/server";
import { POST } from "../route";

const mockVerifySession = jest.fn();
const mockConfirmExecution = jest.fn();
const mockSkipExecution = jest.fn();
const mockMembership = jest.fn();

jest.mock("@/lib/auth/session", () => ({
  verifySession: (...args: unknown[]) => mockVerifySession(...args),
}));
jest.mock("@/lib/groups/permissions", () => ({
  getGroupMembership: (...args: unknown[]) => mockMembership(...args),
}));

jest.mock("@/lib/db/recurring-queries", () => ({
  confirmExecution: (...args: unknown[]) => mockConfirmExecution(...args),
  skipExecution: (...args: unknown[]) => mockSkipExecution(...args),
}));

function makeRequest(action: "confirm" | "skip", body?: unknown): NextRequest {
  const request = new NextRequest(
    `http://localhost:3000/api/recurring-expenses/executions/exec-b?action=${action}`,
    {
      method: "POST",
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json", "x-group-id": "group-a" },
          }),
    ...(body === undefined ? { headers: { "x-group-id": "group-a" } } : {}),
    },
  );
  request.cookies.set("hermes_session", "valid-session");
  return request;
}

describe("POST /api/recurring-expenses/executions/[id]", () => {
  const params = { params: Promise.resolve({ id: "exec-b" }) };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembership.mockResolvedValue({ group_id: "group-a", user_id: "user-a" });
  });

  it("does not dispatch an execution without an authenticated actor", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/recurring-expenses/executions/exec-b?action=confirm",
      { method: "POST" },
    );

    const response = await POST(request, params);

    expect(response.status).toBe(401);
    expect(mockConfirmExecution).not.toHaveBeenCalled();
    expect(mockSkipExecution).not.toHaveBeenCalled();
  });

  it("passes actor A when confirming an execution ID belonging to actor B", async () => {
    mockVerifySession.mockResolvedValue("user-a");
    mockConfirmExecution.mockResolvedValue({ success: false, error: "Ejecución no encontrada" });

    const response = await POST(makeRequest("confirm", { amount: 12500 }), params);

    expect(mockConfirmExecution).toHaveBeenCalledWith("exec-b", "user-a", 12500, undefined, { requiredGroupId: "group-a" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ejecución no encontrada" });
  });

  it("passes the authenticated actor when skipping an execution", async () => {
    mockVerifySession.mockResolvedValue("user-b");
    mockSkipExecution.mockResolvedValue({ success: true });

    const response = await POST(makeRequest("skip"), params);

    expect(mockSkipExecution).toHaveBeenCalledWith("exec-b", "user-b", "group-a");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("preserves the successful confirm response while passing the actor", async () => {
    mockVerifySession.mockResolvedValue("user-a");
    mockConfirmExecution.mockResolvedValue({ success: true, transactionId: "tx-1" });

    const response = await POST(makeRequest("confirm"), params);

    expect(mockConfirmExecution).toHaveBeenCalledWith("exec-b", "user-a", undefined, undefined, { requiredGroupId: "group-a" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, transactionId: "tx-1" });
  });
});
