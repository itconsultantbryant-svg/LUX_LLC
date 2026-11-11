import { defineConfig } from "@playwright/test";
import "dotenv/config";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    },
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
