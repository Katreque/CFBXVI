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

// First-visit onboarding is a single message. While the course is still downloading the
// install offer waits; once it's saved, "saved" and "install" are shown together so the
// student reads one message that explains both what happened and what to do next.
let downloading = false
let justSaved = false
const SAVED = "Pronto! O curso foi salvo neste aparelho."

const canOfferInstall = () =>
  !isStandalone() && !readDismissed() && (Boolean(installPrompt) || isIOS())

function offerInstall() {
  if (downloading || !canOfferInstall()) return
  root?.querySelector('[data-pwa="ready"]')?.remove()
  const later = { label: "Agora não", onClick: writeDismissed }
  if (installPrompt) {
    const text = justSaved
      ? `${SAVED} Instale o app para abrir direto da tela inicial, mesmo sem internet.`
      : "Instale o app para abrir o curso direto da tela inicial, mesmo sem internet."
    show("install", text, [
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
    const how = "toque em Compartilhar e depois em “Adicionar à Tela de Início”."
    const text = justSaved
      ? `${SAVED} Para abrir sem internet, ${how}`
      : `Para acessar o curso sem internet, ${how}`
    show("install", text, [{ ...later, label: "Entendi" }])
  }
}

function onFirstSave() {
  downloading = false
  justSaved = true
  if (canOfferInstall()) offerInstall()
  else show("ready", `${SAVED} Ele funciona mesmo sem internet.`, [], { timeout: 6000 })
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
  if (!("serviceWorker" in navigator)) throw new Error("service workers not supported")
  const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })

  // "First install" means no worker was active yet. navigator.serviceWorker.controller is not
  // a reliable signal: it is null after a hard reload even when a worker is active.
  let firstInstall = !reg.active
  downloading = firstInstall
  if (!firstInstall) setTimeout(offerInstall, 1500)

  const promptUpdate = (worker) =>
    show("update", "Novo conteúdo disponível.", [
      { label: "Atualizar", primary: true, onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
    ])

  const onInstalled = (worker) => {
    if (reg.active) promptUpdate(worker)
    else onFirstSave()
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
  // The install offer is scheduled by registerSW (after the first download, or shortly after
  // load for returning visitors); without service worker support, offer it after load.
  registerSW().catch((err) => {
    console.error("[pwa] service worker registration failed", err)
    downloading = false
    setTimeout(offerInstall, 1500)
  })
  requestPersistence()
}
