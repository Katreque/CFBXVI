import { defineConfig, devices } from "@playwright/test"

const port = 4173

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    serviceWorkers: "allow",
    // Failure screenshots (plus Playwright's error-context.md page snapshot) go to
    // test-results/, which CI uploads when a run fails. Tracing stays off: recording traces
    // stalls service worker installation when tests run in parallel.
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `node serve.mjs --port ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
  },
})
