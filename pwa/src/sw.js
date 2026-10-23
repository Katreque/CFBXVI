import { clientsClaim } from "workbox-core"
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching"
import { setCatchHandler, setDefaultHandler } from "workbox-routing"
import { NetworkOnly } from "workbox-strategies"

// The whole site is precached; the manifest is injected at build time.
// cleanURLs maps "/secoes/nota" to "secoes/nota.html", matching how GitHub Pages serves Quartz output.
precacheAndRoute(self.__WB_MANIFEST, {
  cleanURLs: true,
  directoryIndex: "index.html",
  ignoreURLParametersMatching: [/.*/],
})
cleanupOutdatedCaches()

// Take control on first install so the very first visit is already offline-capable.
// Updates still wait until the user accepts the "new content" prompt (SKIP_WAITING).
clientsClaim()

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting()
})

// Anything not precached goes to the network; offline page loads fall back to the 404 page.
setDefaultHandler(new NetworkOnly())
setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate") {
    return (await matchPrecache("404.html")) ?? Response.error()
  }
  return Response.error()
})
