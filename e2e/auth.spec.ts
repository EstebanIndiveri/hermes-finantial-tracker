import { test, expect } from "@playwright/test";
import { TEST_USER } from "./helpers";

// These tests need a fresh unauthenticated context
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Auth - Login", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.getByPlaceholder("tu_usuario")).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: /ingresar/i })).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("tu_usuario").fill(TEST_USER.username);
    await page.locator('input[type="password"]').first().fill("wrongpass999");
    await page.getByRole("button", { name: /ingresar/i }).click();

    // The error div shows "Usuario o contraseña incorrectos."
    await expect(
      page.getByText("Usuario o contraseña incorrectos.")
    ).toBeVisible({ timeout: 8_000 });
  });

  test("correct credentials redirect to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("tu_usuario").fill(TEST_USER.username);
    await page.locator('input[type="password"]').first().fill(TEST_USER.password);
    await page.getByRole("button", { name: /ingresar/i }).click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 });
  });

  test("password field has show/hide eye toggle", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    // Eye button should be visible next to password field
    await expect(page.locator('button[type="button"]').first()).toBeVisible();
  });

  test("unauthenticated access to dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/login/);
  });
});
