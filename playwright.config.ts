import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, TEST_DATABASE_URL } from "./e2e/env";

// Runs against the production build (`npm run build` first) and its own `ap_it_test` database.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${BASE_URL}/en/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: TEST_DATABASE_URL, BETTER_AUTH_URL: BASE_URL },
  },
});
