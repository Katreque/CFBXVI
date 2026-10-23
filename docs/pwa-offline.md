# PWA & Offline

Quartz v5 has no PWA, service worker or offline support of its own. The `pwa/` package adds it as a post-build step on `public/` (D-011).

```sh
npx quartz build
npm --prefix pwa run build     # must run on a fresh Quartz build (it refuses to run twice)
```

## What the build step does (`pwa/build.mjs`)

1. **Vendors third-party assets** (D-012). Copies pinned d3, pixi.js and KaTeX from `pwa/node_modules` into `public/static/vendor/` and rewrites Quartz's CDN URLs to point there. It also fixes root-absolute `/static/` links that ignore the base path.
2. **Applies patches** to the emitted JS (D-013): accent-insensitive search and Portuguese "no results" text.
3. **Guards** fail the build when something would be missing offline:
   - a known CDN origin anywhere in HTML/JS/CSS (scripts load libraries from these at runtime);
   - **any** external asset a page or stylesheet embeds: `img`/`script`/`iframe`/`video`/`audio`/`source` `src`, stylesheet/icon/preload `<link>`, CSS `url()`. This catches, for example, an image hotlinked in a note or a YouTube embed. Plain `<a href>` links are allowed;
   - a patch that no longer matches;
   - a file Workbox can't precache (over 10 MB).

   Files in `precacheIgnore` are not checked, since they're never used offline.
4. **Manifest and icons**: `public/manifest.webmanifest` with `start_url`/`scope`/`id` = base path; icons copied from `pwa/icons/`.
5. **Injects into every page's `<head>`** the manifest link, theme colors, Apple tags and `static/pwa/client.{js,css}`. Every tag carries `data-persist`, so Quartz's SPA router keeps it across navigations.
6. **Service worker**: bundles `pwa/src/sw.js` and lets Workbox inject the precache manifest, covering **every file** except `precacheIgnore`, each with a content revision. Fails if the precache exceeds the **30 MB budget**.

Configuration lives in `pwa/config.mjs`: app name and colors, vendor list, patches, ignore list.

## Service worker behaviour (`pwa/src/sw.js`)

- **Precache-first for everything.** `cleanURLs` maps `/secoes/nota` to `secoes/nota.html`, matching how GitHub Pages serves Quartz output, including accented URLs.
- **First visit:** `clientsClaim()` puts the page under the service worker's control immediately, so it works offline right after the first load.
- **Updates wait for the user.** The new worker installs in the background and stays waiting until the student taps "Atualizar" (`SKIP_WAITING`), then the page reloads.
- **Offline navigation to an unknown page** falls back to the precached `404.html`.
- Anything else not precached goes to the network.

## Client behaviour (`pwa/src/client.js`)

- Registers `sw.js` with scope = base path.
- Decides "first install vs. update" by whether a worker was already **active** at registration. `navigator.serviceWorker.controller` isn't reliable for this: it's null after a hard reload. It also picks up a worker that was already installing before the script ran.
- **First visit shows one message, never two.** The install offer waits until the course has finished downloading, then appears in the same toast as the "saved" message:
  - installable (Android/Chromium): "Pronto! O curso foi salvo neste aparelho. Instale o app para abrir direto da tela inicial, mesmo sem internet." [Agora não] [Instalar]
  - iOS: "Pronto! O curso foi salvo neste aparelho. Para abrir sem internet, toque em Compartilhar e depois em “Adicionar à Tela de Início”." [Entendi]
  - already installed, or can't install: "Pronto! O curso foi salvo neste aparelho. Ele funciona mesmo sem internet." (hides after 6 s)
- Returning visitors who haven't installed get only the install offer, about 1.5 s after load.
- When an update is waiting, it shows "Novo conteúdo disponível" with an "Atualizar" button.
- Checks for updates whenever the app comes back to the foreground. Installed PWAs, especially on iOS, can stay open for days.
- Calls `navigator.storage.persist()`.
- **Install offer:** Android/Chromium get an "Instalar" button (`beforeinstallprompt`); iOS gets the Share → "Adicionar à Tela de Início" instruction. "Agora não"/"Entendi" hides it for 14 days (stored in `localStorage`, best-effort).
- The UI uses Quartz's CSS variables, so it follows light and dark mode, and it re-attaches after each SPA navigation.

## Size

Phase 1 with sample content: 97 files, 2.7 MB precached. About 1.2 MB of that is d3/pixi/KaTeX/fonts (fixed cost). Expected with all 20 sections: about 5–15 MB, well within budget.

## Platform specifics

### iOS (Safari / WebKit)
- There is **no install prompt**. Users install manually from the Share menu; the in-app hint explains how.
- **Storage eviction:** sites that are *not* installed can lose their storage after about 7 days without use. Installed home-screen apps are much safer. **Installing is part of onboarding, not optional.**
- **No background sync.** Content updates only when the app is opened while online.
- Only real-device testing shows eviction and install behaviour. Simulators aren't enough.

### Android (Chrome)
- Native install prompt (`beforeinstallprompt`).
- Generous quotas; `persist()` is usually granted for installed apps.

## GitHub Pages constraints

- Served from a **subpath** (`/CFBXVI/`). The base path is derived from `baseUrl` in `quartz.config.yaml`, so the manifest, service worker scope and injected tags all follow it.
- Response headers can't be customised. Pages sends a short `Cache-Control` on `sw.js`, which is fine: browsers check `sw.js` for updates regardless.
- Pages serves `/a/b` from `a/b.html`. `pwa/serve.mjs` mimics this for local testing.

## Origin change (future custom domain)

A PWA's storage and install are tied to its **origin**. Moving from `katreque.github.io` to a custom domain means:
- students have to install the app again from the new address;
- the new origin downloads the full precache again;
- the old installed icon keeps working, but it no longer receives updates.

Plan for the move: change `baseUrl` in `quartz.config.yaml` (everything else follows). The release that changes the domain also ships a "Este app mudou de endereço — toque para reinstalar" banner on the old origin (D-008).

## Testing

`pwa/tests/` (Playwright, on Pixel 7 and desktop Chrome profiles; runs in CI before every deploy):
- the service worker installs with the right scope; the manifest and icons are valid;
- pages load offline, including accented URLs and full reloads;
- SPA navigation through wikilinks works offline, and backlinks render;
- no request fails offline on a page with the graph view (fonts, d3, pixi);
- search works offline and ignores accents;
- unknown pages offline fall back to the 404 page;
- update flow: a new deploy shows the prompt, and accepting it activates the new worker and reloads;
- first-visit onboarding (default, iOS, installable): exactly one toast, and the install offer doesn't come back after "Instalar".

On failure, CI uploads screenshots and Playwright's page snapshots (`pwa/test-results`). Trace recording is off on purpose: it stalls service worker installation when tests run in parallel.

**Still manual:** install and offline checks on a real iPhone and a real Android phone before each student-facing release. Playwright can't emulate WebKit's install or eviction behaviour.
