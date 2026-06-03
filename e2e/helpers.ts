import { Page } from "@playwright/test";

/** Pre-seeded test user — exists in DB with onboarding completed */
export const TEST_USER = {
  username: "e2e_test_user",
  password: "E2eTest@2026!",
};

/**
 * Logs in with the pre-seeded test user via the /login page.
 * Used only for tests that need to start from an unauthenticated state.
 */
export async function loginTestUser(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByPlaceholder("tu_usuario").fill(TEST_USER.username);
  await page.locator('input[type="password"]').first().fill(TEST_USER.password);
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.waitForURL(/dashboard/, { timeout: 30_000 });
}
