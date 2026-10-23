// Renders the app icons from icon.svg into icons/. Run after changing the icon:
//   npm run icons
// The PNGs are committed so builds don't depend on the fonts installed on the CI runner.
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { app } from "./config.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, "icons")
await mkdir(out, { recursive: true })

const render = (size) => sharp(path.join(here, "icon.svg"), { density: 300 }).resize(size, size)

await render(192).png().toFile(path.join(out, "icon-192.png"))
await render(512).png().toFile(path.join(out, "icon-512.png"))
await render(180).flatten({ background: app.backgroundColor }).png().toFile(path.join(out, "apple-touch-icon.png"))

// Maskable: shrink the artwork into the 80% safe zone on a full-bleed background.
const inner = await render(410).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: app.themeColor.light } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile(path.join(out, "icon-maskable-512.png"))

console.log("icons written to pwa/icons/")
