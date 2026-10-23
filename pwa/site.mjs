// Site URL facts derived from ../quartz.config.yaml, shared by the build, the preview
// server and the tests so the base path is computed in exactly one place.
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

export const pwaDir = path.dirname(fileURLToPath(import.meta.url))
export const rootDir = path.resolve(pwaDir, "..")
export const publicDir = path.join(rootDir, "public")

const config = YAML.parse(readFileSync(path.join(rootDir, "quartz.config.yaml"), "utf8"))

// e.g. "katreque.github.io/CFBXVI"
export const baseUrl = config.configuration.baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")

// e.g. "/CFBXVI/", or "/" when the site is served from a domain root
export const basePath = `/${baseUrl.split("/").slice(1).join("/")}/`.replace(/\/+/g, "/")
