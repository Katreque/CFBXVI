// Simulates a new deploy for a returning visitor: a changed sw.js must surface the update
// prompt, and accepting it must hand control to the new service worker and reload.
import { expect, test } from "@playwright/test"

const BASE = "/CFBXVI/"

test("a new deploy shows the update prompt and applies it", async ({ page, context }) => {
  let deploy = 1
  await context.route(`**${BASE}sw.js`, async (route) => {
    const res = await route.fetch()
    const body = (await res.text()) + `\n// deploy ${deploy}`
    await route.fulfill({ response: res, body })
  })

  await page.goto(BASE)
  await page.evaluate(() => navigator.serviceWorker.ready)
  // First install shows the offline-ready message, not the update prompt.
  await expect(page.locator('[data-pwa="ready"]')).toBeVisible()

  deploy = 2
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())

  const prompt = page.locator('[data-pwa="update"]')
  await expect(prompt).toContainText("Novo conteúdo disponível")
  const reloaded = page.waitForEvent("load")
  await prompt.getByRole("button", { name: "Atualizar" }).click()
  await reloaded

  const scriptURL = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)
  expect(scriptURL).toContain(`${BASE}sw.js`)
  await expect(page.locator('[data-pwa="update"]')).toHaveCount(0)
})
