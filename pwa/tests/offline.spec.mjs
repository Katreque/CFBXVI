// End-to-end offline checks against the built site (run `npx quartz build` and
// `npm --prefix pwa run build` first). Content-specific paths come from the sample notes.
import { expect, test } from "@playwright/test"
import { basePath as BASE } from "../site.mjs"

async function goOffline(page, context) {
  await page.goto(BASE)
  // The service worker precaches everything during install; `ready` resolves once it is active.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }))
    }
  })
  await context.setOffline(true)
}

// The search button only works once Quartz's scripts have attached their handlers,
// so retry the click until the search bar opens.
async function openSearch(page) {
  await expect(async () => {
    await page.locator(".search-button").first().click()
    await expect(page.locator(".search-bar")).toBeVisible({ timeout: 1000 })
  }).toPass()
}

test("first visit installs a service worker that controls the page", async ({ page }) => {
  await page.goto(BASE)
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(new URL(scope).pathname).toBe(BASE)
})

test("manifest is valid and installable", async ({ request }) => {
  const res = await request.get(`${BASE}manifest.webmanifest`)
  expect(res.ok()).toBe(true)
  const manifest = await res.json()
  expect(manifest.start_url).toBe(BASE)
  expect(manifest.scope).toBe(BASE)
  expect(manifest.display).toBe("standalone")
  const sizes = manifest.icons.map((i) => i.sizes)
  expect(sizes).toContain("192x192")
  expect(sizes).toContain("512x512")
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true)
  }
})

test("pages load offline, including accented URLs and full reloads", async ({ page, context }) => {
  await goOffline(page, context)

  await page.goto(`${BASE}secoes/seção-02---aplicações`)
  await expect(page.locator("h1.article-title")).toHaveText("Seção 02 - Aplicações")

  await page.reload()
  await expect(page.locator("h1.article-title")).toHaveText("Seção 02 - Aplicações")
})

test("SPA navigation through wikilinks works offline", async ({ page, context }) => {
  await goOffline(page, context)
  await page.goto(`${BASE}secoes/seção-01---introdução`)
  await page.locator("article a.internal", { hasText: "função" }).first().click()
  await expect(page.locator("h1.article-title")).toHaveText("Função")
  await expect(page).toHaveURL(/conceitos\/fun%C3%A7%C3%A3o$/)
  // Backlinks only render when wikilinks point at the note itself, not an alias redirect.
  await expect(page.locator(".backlinks")).toContainText("Seção 01 - Introdução")
})

test("no request fails offline (fonts, scripts, graph libraries)", async ({ page, context }) => {
  await goOffline(page, context)
  const failed = []
  page.on("requestfailed", (r) => failed.push(r.url()))
  await page.goto(`${BASE}conceitos/função`)
  await page.waitForLoadState("networkidle")
  // The graph view loads d3 and pixi.js on demand.
  await expect(page.locator(".graph canvas").first()).toBeVisible()
  expect(failed).toEqual([])
})

test("search works offline", async ({ page, context }) => {
  await goOffline(page, context)
  await page.goto(`${BASE}`)
  await openSearch(page)
  await page.locator(".search-bar").fill("domínio")
  await expect(page.locator(".search-layout")).toContainText("Domínio")
})

test("search ignores accents", async ({ page }) => {
  await page.goto(BASE)
  await openSearch(page)
  await page.locator(".search-bar").fill("funcao")
  await expect(page.locator(".search-layout")).toContainText("Função")
})

test("unknown pages offline fall back to the 404 page", async ({ page, context }) => {
  await goOffline(page, context)
  await page.goto(`${BASE}nao-existe`)
  await expect(page.locator("body")).toContainText("404")
})
