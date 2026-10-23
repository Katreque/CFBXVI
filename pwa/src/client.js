// Service worker registration plus the install / update / offline-ready UI.
// Injected into every page's <head> with data-persist, so Quartz's SPA router keeps it
// (and never re-executes it). The UI lives in <body>, which the router replaces on every
// navigation, so it is re-mounted on each "nav" event.

const BASE = __BASE_PATH__
const DISMISS_KEY = "pwa-install-dismissed-at"
const DISMISS_DAYS = 14

let root
let installPrompt = null

function mount() {
  if (!root) {
    root = document.createElement("div")
    root.id = "pwa-ui"
    root.setAttribute("aria-live", "polite")
  }
  if (!root.isConnected) document.body.appendChild(root)
}

function show(id, text, actions = [], { timeout } = {}) {
  mount()
  root.querySelector(`[data-pwa="${id}"]`)?.remove()
  const el = document.createElement("div")
  el.className = "pwa-toast"
  el.dataset.pwa = id
  const msg = document.createElement("p")
  msg.textContent = text
  el.appendChild(msg)
  for (const { label, primary, onClick } of actions) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.textContent = label
    if (primary) btn.className = "primary"
    btn.addEventListener("click", () => {
      el.remove()
      onClick?.()
    })
    el.appendChild(btn)
  }
  root.appendChild(el)
  if (timeout) setTimeout(() => el.remove(), timeout)
}

// --- storage helpers (storage can be unavailable, e.g. private mode) ---

function readDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return at && Date.now() - at < DISMISS_DAYS * 864e5
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {}
}

// --- install ---

const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

function offerInstall() {
  if (isStandalone() || readDismissed()) return
  const later = { label: "Agora não", onClick: writeDismissed }
  if (installPrompt) {
    show("install", "Instale o app para acessar o curso sem internet.", [
      later,
      {
        label: "Instalar",
        primary: true,
        onClick: async () => {
          // A prompt event can only be used once; clear it first so a later offerInstall()
          // (e.g. the on-load timer) doesn't show the toast again while the dialog is open.
          const prompt = installPrompt
          installPrompt = null
          if (!prompt) return
          await prompt.prompt()
          await prompt.userChoice
        },
      },
    ])
  } else if (isIOS()) {
    show(
      "install",
      "Para acessar o curso sem internet, toque em Compartilhar e depois em “Adicionar à Tela de Início”.",
      [{ ...later, label: "Entendi" }],
    )
  }
}

addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault()
  installPrompt = event
  offerInstall()
})

addEventListener("appinstalled", () => {
  installPrompt = null
  root?.querySelector('[data-pwa="install"]')?.remove()
})

// --- service worker ---

async function registerSW() {
  if (!("serviceWorker" in navigator)) return
  const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })

  // "First install" means no worker was active yet. navigator.serviceWorker.controller is not
  // a reliable signal: it is null after a hard reload even when a worker is active.
  let firstInstall = !reg.active

  const promptUpdate = (worker) =>
    show("update", "Novo conteúdo disponível.", [
      { label: "Atualizar", primary: true, onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
    ])

  const onInstalled = (worker) => {
    if (reg.active) promptUpdate(worker)
    else show("ready", "Conteúdo salvo. O curso já funciona sem internet.", [], { timeout: 6000 })
  }

  const track = (worker) => {
    if (worker.state === "installed") return onInstalled(worker)
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") onInstalled(worker)
    })
  }

  if (reg.waiting && reg.active) promptUpdate(reg.waiting)
  // The browser may have started installing a new version before this script ran,
  // in which case "updatefound" has already fired.
  if (reg.installing) track(reg.installing)
  reg.addEventListener("updatefound", () => reg.installing && track(reg.installing))

  // The first install also fires controllerchange (clientsClaim) and must not reload.
  // Every later change is an accepted update.
  let reloading = false
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (firstInstall) {
      firstInstall = false
      return
    }
    if (reloading) return
    reloading = true
    location.reload()
  })

  // Installed PWAs (especially on iOS) can stay open for days: check for updates on resume.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) reg.update().catch(() => {})
  })
}

async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {}
}

if (!window.__pwaInit) {
  window.__pwaInit = true
  document.addEventListener("nav", mount)
  registerSW().catch((err) => console.error("[pwa] service worker registration failed", err))
  requestPersistence()
  addEventListener("load", () => setTimeout(offerInstall, 1500))
}
