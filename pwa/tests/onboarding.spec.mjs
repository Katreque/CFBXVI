// First visit shows a single onboarding message: "saved for offline" and, when the app can
// be installed, the install offer in the same toast (never two toasts at once).
import { devices, expect, test } from "@playwright/test"
import { basePath as BASE } from "../site.mjs"

const toasts = (page) => page.locator("#pwa-ui .pwa-toast")

async function waitForFirstSave(page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
}

test("no install option: one 'saved' toast", async ({ page }) => {
  await page.goto(BASE)
  await waitForFirstSave(page)
  await expect(toasts(page)).toHaveCount(1)
  await expect(page.locator('[data-pwa="ready"]')).toContainText("salvo neste aparelho")
})

test.describe("iOS", () => {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices["iPhone 13"]
  test.use({ userAgent, viewport, deviceScaleFactor, isMobile, hasTouch })

  test("one toast that says it's saved and how to add it to the home screen", async ({ page }) => {
    await page.goto(BASE)
    await waitForFirstSave(page)
    const install = page.locator('[data-pwa="install"]')
    await expect(install).toContainText("salvo neste aparelho")
    await expect(install).toContainText("Adicionar à Tela de Início")
    await expect(toasts(page)).toHaveCount(1)
  })
})

test.describe("installable (Android/Chromium)", () => {
  test.beforeEach(async ({ page }) => {
    // Headless Chromium never fires beforeinstallprompt; simulate it at page load,
    // while the first download is typically still running.
    await page.addInitScript(() => {
      addEventListener("load", () => {
        const event = new Event("beforeinstallprompt", { cancelable: true })
        event.prompt = async () => {
          window.__installPrompted = (window.__installPrompted ?? 0) + 1
        }
        event.userChoice = Promise.resolve({ outcome: "accepted" })
        dispatchEvent(event)
      })
    })
  })

  test("one toast that says it's saved and offers to install", async ({ page }) => {
    await page.goto(BASE)
    await waitForFirstSave(page)
    const install = page.locator('[data-pwa="install"]')
    await expect(install).toContainText("salvo neste aparelho")
    await expect(install.getByRole("button", { name: "Instalar" })).toBeVisible()
    await expect(toasts(page)).toHaveCount(1)
  })

  test("after tapping Instalar the offer doesn't come back", async ({ page }) => {
    await page.goto(BASE)
    await waitForFirstSave(page)
    await page.locator('[data-pwa="install"]').getByRole("button", { name: "Instalar" }).click()
    await page.waitForTimeout(2500) // past the returning-visitor offer delay
    await expect(page.locator('[data-pwa="install"]')).toHaveCount(0)
    expect(await page.evaluate(() => window.__installPrompted)).toBe(1)
  })
})
