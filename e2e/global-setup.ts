import { chromium } from "@playwright/test";
import { requireE2ECredentials, requireSafeE2EBaseUrl } from "./test-target";

async function globalSetup() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const baseURL = requireSafeE2EBaseUrl();
    const credentials = requireE2ECredentials();

    await page.goto(`${baseURL}/login`);
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("tu_usuario").fill(credentials.username);
    await page.locator('input[type="password"]').first().fill(credentials.password);
    await page.getByRole("button", { name: /ingresar/i }).click();

    await page.waitForURL(/dashboard/, { timeout: 30_000 });
    await page.context().storageState({ path: "e2e/.auth.json" });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
