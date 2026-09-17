import { Page } from "@playwright/test";
import { requireE2ECredentials } from "./test-target";

/**
 * Logs in with the explicitly configured staging test user via the /login page.
 * Used only for tests that need to start from an unauthenticated state.
 */
export async function loginTestUser(page: Page) {
  const testUser = requireE2ECredentials();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByPlaceholder("tu_usuario").fill(testUser.username);
  await page.locator('input[type="password"]').first().fill(testUser.password);
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.waitForURL(/dashboard/, { timeout: 30_000 });
}
