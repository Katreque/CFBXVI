// PWA post-build step. Run after `npx quartz build`:
//   npm --prefix pwa run build
// 1. vendors CDN libraries into the site so nothing is fetched from third parties,
//    and applies the patches listed in config.mjs
// 2. fails if any third-party asset URL is left, or a file can't be precached (offline gaps)
// 3. writes the web app manifest, icons and client script, and injects them into every page
// 4. generates the service worker that precaches the whole site
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import * as esbuild from "esbuild"
import { injectManifest } from "workbox-build"
import {
  allowedThirdParty,
  app,
  forbiddenOrigins,
  patches,
  precacheIgnore,
  vendor,
  vendorDirs,
} from "./config.mjs"
import { baseUrl, basePath, publicDir, pwaDir as here } from "./site.mjs"

const modules = path.join(here, "node_modules")

// Fail the build if the precache grows past this. See docs/pwa-offline.md (size budget).
const PRECACHE_BUDGET_BYTES = 30 * 1024 * 1024
// Larger single files can't be precached; the build fails rather than silently skipping them.
const MAX_FILE_BYTES = 10 * 1024 * 1024

// Absolute http(s) URLs that the browser would fetch as part of rendering a page:
// embedded media/scripts/frames, stylesheets/icons/preloads, and CSS url(...).
// Plain <a href> links are fine: following them offline is expected to fail.
function externalAssetUrls(text) {
  const urls = []
  for (const [, url] of text.matchAll(
    /<(?:img|script|iframe|video|audio|source|track|embed)\b[^>]*?\ssrc="(https?:\/\/[^"]+)"/g,
  )) {
    urls.push(url)
  }
  for (const [tag] of text.matchAll(/<link\b[^>]*>/g)) {
    const rel = tag.match(/\srel="([^"]+)"/)?.[1] ?? ""
    const href = tag.match(/\shref="(https?:\/\/[^"]+)"/)?.[1]
    if (href && /\b(stylesheet|preload|modulepreload|icon|manifest)\b/.test(rel)) urls.push(href)
  }
  for (const [, url] of text.matchAll(/url\(\s*["']?(https?:\/\/[^"')\s]+)/g)) urls.push(url)
  return urls
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])),
  )
  return files.flat()
}

const rel = (file) => path.relative(publicDir, file).split(path.sep).join("/")

// precacheIgnore entries are exact paths or "dir/**".
const isPrecacheIgnored = (file) =>
  precacheIgnore.some((p) => (p.endsWith("/**") ? rel(file).startsWith(p.slice(0, -2)) : rel(file) === p))

try {
  await stat(path.join(publicDir, "index.html"))
} catch {
  console.error("public/index.html not found. Run `npx quartz build` first.")
  process.exit(1)
}
try {
  await stat(path.join(publicDir, "sw.js"))
  console.error("public/ was already processed. Run `npx quartz build` again before this step.")
  process.exit(1)
} catch {}

// --- 1. vendor CDN libraries ---

for (const { from, to } of vendor) {
  await mkdir(path.dirname(path.join(publicDir, to)), { recursive: true })
  await cp(path.join(modules, from), path.join(publicDir, to))
}
for (const { from, to, filter } of vendorDirs) {
  await mkdir(path.join(publicDir, to), { recursive: true })
  for (const name of (await readdir(path.join(modules, from))).filter(filter)) {
    await cp(path.join(modules, from, name), path.join(publicDir, to, name))
  }
}

const textFiles = (await walk(publicDir)).filter((f) => /\.(html|js|css)$/.test(f))
const leftovers = []
const appliedPatches = new Set()
for (const file of textFiles) {
  const original = await readFile(file, "utf8")
  let text = original
  for (const { match, to } of vendor) text = text.replaceAll(match, `${basePath}${to}`)
  if (file.endsWith(".js")) {
    for (const patch of patches) {
      if (!text.includes(patch.find)) continue
      text = text.replaceAll(patch.find, patch.replace)
      appliedPatches.add(patch)
    }
  }
  // Some plugins (e.g. quartz-fonts) emit root-absolute "/static/..." links that ignore the
  // base path, which breaks when the site lives under a subpath like GitHub Pages' /<repo>/.
  if (basePath !== "/") text = text.replace(/(href|src)="\/static\//g, `$1="${basePath}static/`)
  // Preconnect hints to CDNs we no longer use.
  text = text.replace(/<link rel="preconnect" href="https:\/\/cdnjs\.cloudflare\.com"[^>]*>/g, "")
  // Self-hosted fonts are referenced with the absolute production URL; make them
  // origin-relative so local previews and a future custom domain work.
  if (file.endsWith(".css")) text = text.replaceAll(`https://${baseUrl}/`, basePath)
  if (text !== original) await writeFile(file, text)

  // Two checks: known CDN origins anywhere (scripts load libraries dynamically from them),
  // and any external asset a page or stylesheet embeds (e.g. an image hotlinked in a note).
  // Files we don't precache (e.g. the unused giscus comment styles) aren't used offline.
  if (isPrecacheIgnored(file)) continue
  let checked = text
  for (const prefix of allowedThirdParty) checked = checked.replaceAll(prefix, "")
  for (const origin of forbiddenOrigins) {
    if (checked.includes(origin)) leftovers.push(`${rel(file)}: ${origin}`)
  }
  if (!file.endsWith(".js")) {
    for (const url of externalAssetUrls(text)) {
      if (!allowedThirdParty.some((p) => url.startsWith(p))) leftovers.push(`${rel(file)}: ${url}`)
    }
  }
}

const missingPatches = patches.filter((p) => !appliedPatches.has(p))
if (missingPatches.length > 0) {
  console.error("Patches no longer match Quartz's output (did a plugin update change it?):")
  for (const p of missingPatches) console.error(`  ${p.reason}`)
  console.error("Update or remove them in pwa/config.mjs.")
  process.exit(1)
}

// --- 2. guard against third-party assets ---

if (leftovers.length > 0) {
  console.error("Third-party asset URLs left in the build (these break offline use):")
  for (const l of [...new Set(leftovers)]) console.error(`  ${l}`)
  console.error(
    "Download the asset into content/ (notes) or add it to `vendor` in pwa/config.mjs (Quartz).",
  )
  process.exit(1)
}

// --- 3. manifest, icons, client script ---

const pwaDir = path.join(publicDir, "static", "pwa")
await mkdir(pwaDir, { recursive: true })
await cp(path.join(here, "icons"), pwaDir, { recursive: true })

const manifest = {
  id: basePath,
  name: app.name,
  short_name: app.shortName,
  description: app.description,
  lang: app.lang,
  start_url: basePath,
  scope: basePath,
  display: "standalone",
  background_color: app.backgroundColor,
  theme_color: app.themeColor.light,
  icons: [
    { src: `${basePath}static/pwa/icon-192.png`, sizes: "192x192", type: "image/png" },
    { src: `${basePath}static/pwa/icon-512.png`, sizes: "512x512", type: "image/png" },
    {
      src: `${basePath}static/pwa/icon-maskable-512.png`,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
}
await writeFile(path.join(publicDir, "manifest.webmanifest"), JSON.stringify(manifest, null, 2))

await esbuild.build({
  entryPoints: [path.join(here, "src", "client.js"), path.join(here, "src", "client.css")],
  outdir: pwaDir,
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari15"],
  define: { __BASE_PATH__: JSON.stringify(basePath) },
  logLevel: "warning",
})

// data-persist: Quartz's SPA router keeps these in <head> across navigations.
const headTags = [
  `<link data-persist rel="manifest" href="${basePath}manifest.webmanifest">`,
  `<meta data-persist name="theme-color" media="(prefers-color-scheme: light)" content="${app.themeColor.light}">`,
  `<meta data-persist name="theme-color" media="(prefers-color-scheme: dark)" content="${app.themeColor.dark}">`,
  `<meta data-persist name="mobile-web-app-capable" content="yes">`,
  `<meta data-persist name="apple-mobile-web-app-capable" content="yes">`,
  `<meta data-persist name="apple-mobile-web-app-title" content="${app.shortName}">`,
  `<meta data-persist name="apple-mobile-web-app-status-bar-style" content="default">`,
  `<link data-persist rel="apple-touch-icon" href="${basePath}static/pwa/apple-touch-icon.png">`,
  `<link data-persist rel="stylesheet" href="${basePath}static/pwa/client.css">`,
  `<script data-persist defer src="${basePath}static/pwa/client.js"></script>`,
].join("")

for (const file of textFiles.filter((f) => f.endsWith(".html"))) {
  const html = await readFile(file, "utf8")
  if (html.includes(`${basePath}manifest.webmanifest`)) continue // already processed
  if (!html.includes("</head>")) throw new Error(`no </head> in ${rel(file)}`)
  await writeFile(file, html.replace("</head>", `${headTags}</head>`))
}

// --- 4. service worker ---

const swTmp = path.join(here, ".tmp", "sw.js")
await esbuild.build({
  entryPoints: [path.join(here, "src", "sw.js")],
  outfile: swTmp,
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari15"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
})

const { count, size, warnings } = await injectManifest({
  swSrc: swTmp,
  swDest: path.join(publicDir, "sw.js"),
  globDirectory: publicDir,
  globPatterns: ["**/*"],
  globIgnores: precacheIgnore,
  // Every file gets a content revision, including hash-named ones: our patches change
  // their content after Quartz computed the name.
  maximumFileSizeToCacheInBytes: MAX_FILE_BYTES,
})
await rm(path.join(here, ".tmp"), { recursive: true, force: true })

// Workbox only warns about files it leaves out (e.g. too large); any of those would be
// missing offline, so treat them as errors.
if (warnings.length > 0) {
  console.error("Some files were left out of the precache and would be missing offline:")
  for (const w of warnings) console.error(`  ${w}`)
  process.exit(1)
}
console.log(`PWA: precaching ${count} files, ${(size / 1024 / 1024).toFixed(2)} MB (base ${basePath})`)

if (size > PRECACHE_BUDGET_BYTES) {
  console.error(`Precache exceeds budget of ${PRECACHE_BUDGET_BYTES / 1024 / 1024} MB.`)
  process.exit(1)
}
