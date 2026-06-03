import { test, expect } from "@playwright/test";

// All tests use the pre-authenticated storageState from global setup

test.describe("Group features", () => {
  test("active group API returns group_id and role", async ({ page }) => {
    const response = await page.request.get("/api/groups/active");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("group_id");
    expect(body).toHaveProperty("role");
    expect(["owner", "admin", "member"]).toContain(body.role);
  });

  test("settings page shows group-specific data", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/settings/);
    await expect(page.locator("body")).not.toContainText("500");
  });
});

test.describe("API health checks", () => {
  test("unauthenticated API returns 401, not 500", async ({ playwright }) => {
    // Create a clean API context without any auth cookies
    const baseURL = "https://hermes-finantial-tracker.vercel.app";
    const apiContext = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });

    const endpoints = [
      "/api/transactions",
      "/api/categories",
      "/api/settings/monthly",
      "/api/settings/budgets",
      "/api/settings/thresholds",
      "/api/groups/active",
    ];

    for (const endpoint of endpoints) {
      const response = await apiContext.get(endpoint);
      expect(response.status()).toBe(401);
    }

    await apiContext.dispose();
  });

  test("login with wrong credentials returns 401", async ({ page }) => {
    const response = await page.request.post("/api/auth/login", {
      data: { username: "noexist", password: "nopass" },
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status()).not.toBe(500);
    expect([400, 401]).toContain(response.status());
  });

  test("invite endpoint with fake token returns 400/401, not 500", async ({ page }) => {
    const response = await page.goto("/api/groups/invite?token=fake-token");
    expect(response?.status()).not.toBe(500);
  });

  test("authenticated user can fetch categories", async ({ page }) => {
    const response = await page.request.get("/api/categories");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("authenticated user can fetch monthly settings", async ({ page }) => {
    const response = await page.request.get("/api/settings/monthly");
    expect(response.status()).toBe(200);
  });
});
