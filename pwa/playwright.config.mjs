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
