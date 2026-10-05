import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e-core",
  outputDir: "test-results/core",
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/core" }]],
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    {
      name: "core-desktop",
      testMatch: ["security.spec.ts", "p5.spec.ts", "x2.spec.ts", "p8.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "core-mobile",
      testMatch: ["mobile.spec.ts", "p5-mobile.spec.ts", "x2-mobile.spec.ts", "p8-mobile.spec.ts"],
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run start -- --port 3101",
    url: "http://127.0.0.1:3101/api/ready",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      LONDOS_CORE_ENABLED: "true",
      AUTH_BASE_URL: "http://127.0.0.1:3101",
      LONDOS_DATA_SOURCE: "database",
      LONDOS_LOCAL_ADAPTERS: "true",
    },
  },
});
