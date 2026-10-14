import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL: run against an already-deployed site. Unset: Playwright starts the dev server.
// PW_EXECUTABLE_PATH: use a preinstalled Chromium (e.g. /opt/pw-browsers/chromium in the hosted sandbox).
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const executablePath = process.env.PW_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  // Dev-mode routes compile on first request, so allow for slow first loads.
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    trace: process.env.E2E_ADMIN_TOTP_SECRET ? "off" : "on-first-retry",
    screenshot: "only-on-failure",
  },

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx vite dev --port 5173 --host 127.0.0.1",
        url: "http://127.0.0.1:5173/",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(executablePath ? {launchOptions:{executablePath}} : {}) },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "mobile-375", testMatch: /(?:mobile|phase-one-authenticated)\.spec\.ts/, use: { ...devices["iPhone SE"], viewport: {width:375,height:667} } },
  ],
});
