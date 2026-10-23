// Serves ../public under the site's base path, mimicking GitHub Pages:
//   /base/        -> index.html
//   /base/a/b     -> a/b.html (or a/b/index.html)
//   anything else -> 404.html with status 404
// Usage: npm --prefix pwa run preview  [-- --port 8080]
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { basePath, publicDir } from "./site.mjs"

const portArg = process.argv.indexOf("--port")
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 8080

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".xml": "application/xml",
}

async function isFile(p) {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

async function resolve(urlPath) {
  if (!urlPath.startsWith(basePath)) return null
  let relPath
  try {
    relPath = decodeURIComponent(urlPath.slice(basePath.length))
  } catch {
    return null // malformed percent-encoding
  }
  const target = path.join(publicDir, relPath)
  if (target !== publicDir && !target.startsWith(publicDir + path.sep)) return null
  for (const candidate of [target, `${target}.html`, path.join(target, "index.html")]) {
    if (await isFile(candidate)) return candidate
  }
  return null
}

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost")
    if (pathname === basePath.slice(0, -1)) {
      res.writeHead(301, { location: basePath }).end()
      return
    }
    const file = await resolve(pathname)
    const status = file ? 200 : 404
    const body = file ?? path.join(publicDir, "404.html")
    res.writeHead(status, {
      "content-type": types[path.extname(body)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    })
    createReadStream(body).pipe(res)
  })
  .listen(port, () => console.log(`Serving public/ at http://localhost:${port}${basePath}`))
