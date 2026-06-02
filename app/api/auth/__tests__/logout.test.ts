import { POST } from "../logout/route";
import { NextRequest } from "next/server";

function makeReq() {
  return new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
}

describe("POST /api/auth/logout", () => {
  test("returns 303 redirect to /login", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login");
  });

  test("clears hermes_session cookie", async () => {
    const res = await POST(makeReq());
    const cookie = res.cookies.get("hermes_session");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.path).toBe("/");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
  });

  test("clears active_group_id cookie", async () => {
    const res = await POST(makeReq());
    const cookie = res.cookies.get("active_group_id");
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});
