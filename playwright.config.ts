import { defineConfig, devices } from "@playwright/test";
import { requireSafeE2EBaseUrl } from "./e2e/test-target";

const baseURL = requireSafeE2EBaseUrl();

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    headless: true,
    storageState: "e2e/.auth.json",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: [],
    },
  ],
});
