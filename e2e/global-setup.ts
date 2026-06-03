import { chromium } from "@playwright/test";

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const baseURL = process.env.BASE_URL || "https://hermes-finantial-tracker.vercel.app";

  await page.goto(`${baseURL}/login`);
  await page.waitForLoadState("networkidle");

  await page.getByPlaceholder("tu_usuario").fill("e2e_test_user");
  await page.locator('input[type="password"]').first().fill("E2eTest@2026!");
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.waitForURL(/dashboard/, { timeout: 30_000 });

  // Save authenticated state (cookies) to file
  await page.context().storageState({ path: "e2e/.auth.json" });
  await browser.close();
}

export default globalSetup;
