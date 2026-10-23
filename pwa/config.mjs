// App identity and offline-vendoring rules for the PWA post-build step.
// Site URL/base path come from ../quartz.config.yaml (configuration.baseUrl).

export const app = {
  name: "CFBXVI",
  shortName: "CFBXVI",
  description: "Material do curso disponível offline.",
  lang: "pt-BR",
  themeColor: { light: "#284b63", dark: "#161618" },
  backgroundColor: "#faf8f8",
}

// Quartz loads these libraries from CDNs at runtime. We serve pinned copies from our
// own origin instead (versions locked in package-lock.json) so they can be precached.
// If Quartz changes one of these URLs, the external-URL guard in build.mjs fails the build.
export const vendor = [
  {
    match: "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js",
    from: "d3/dist/d3.min.js",
    to: "static/vendor/d3.min.js",
  },
  {
    match: "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.js",
    from: "pixi.js/dist/pixi.min.js",
    to: "static/vendor/pixi.min.js",
  },
  {
    match: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css",
    from: "katex/dist/katex.min.css",
    to: "static/vendor/katex/katex.min.css",
  },
  {
    match: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/copy-tex.min.js",
    from: "katex/dist/contrib/copy-tex.min.js",
    to: "static/vendor/katex/copy-tex.min.js",
  },
]

// KaTeX fonts referenced by katex.min.css as url(fonts/...). Modern browsers pick woff2.
export const vendorDirs = [
  { from: "katex/dist/fonts", to: "static/vendor/katex/fonts", filter: (f) => f.endsWith(".woff2") },
]

// Any of these left in the output after vendoring means a page would break offline.
export const forbiddenOrigins = [
  "https://cdn.jsdelivr.net",
  "https://cdnjs.cloudflare.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://unpkg.com",
]

// Exact find/replace patches on Quartz's emitted scripts, for plugin behaviour we can't
// configure. Each `find` must match in at least one file or the build fails, so a plugin
// update that changes the code is noticed instead of silently dropping the patch.
export const patches = [
  {
    reason: "search: ignore accents so 'funcao' finds 'função' (tokenizer only lowercases)",
    find: "i=t.toLowerCase(),s=0;for(let u of i)",
    replace: 'i=t.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase(),s=0;for(let u of i)',
  },
  {
    reason: "search: empty-result message is hardcoded in English",
    find: 'M.textContent="No results.";',
    replace: 'M.textContent="Nenhum resultado.";',
  },
  {
    reason: "search: empty-result hint is hardcoded in English",
    find: 'L.textContent="Try another search term?"',
    replace: 'L.textContent="Tente outro termo de busca."',
  },
]

// Known third-party URLs that are never requested by the site (checked as prefixes).
export const allowedThirdParty = [
  // pixi.js defaults for compressed-texture transcoders; the graph view never loads KTX/Basis textures.
  "https://cdn.jsdelivr.net/npm/pixi.js/transcoders/",
]

// Build output that students never need offline.
export const precacheIgnore = [
  "sw.js",
  "index.xml",
  "sitemap.xml",
  "static/og-image.png",
  "static/giscus/**",
]
