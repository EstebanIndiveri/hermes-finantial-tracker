import { POST } from "../logout/route";

describe("POST /api/auth/logout", () => {
  test("returns 200 with ok response", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test("sets hermes_session cookie to empty with all security attributes", async () => {
    const res = await POST();
    const cookie = res.cookies.get("hermes_session");
    
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.path).toBe("/");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
  });
});
