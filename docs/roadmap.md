# Roadmap

| Phase | Deliverable | Done when | Status |
|---|---|---|---|
| **1. Site + PWA** | Quartz v5 set up, pt-BR, a few sample notes, manifest, service worker, update prompt, iOS install guide, Pages deploy workflow | Installed on a real iPhone and Android phone, browsable in airplane mode | **Deployed; waiting on real-device check** |
| **2. Ingest pipeline** | Docling extraction (DOCX/PDF/PPTX), `glossary.yml`, linker, `sources.lock`, `/ingest` skill, PR flow | One real section ingested and reviewed through a PR | Not started |
| **3. Hardening** | Lighthouse CI, image optimisation, Dependabot | CI checks green on every PR | Partly done: offline Playwright tests and the precache size budget already run in CI |
| **4. Bulk ingest** | All ~20 sections ingested; glossary reviewed with the teacher | Full course available offline | Not started |

## Phase 1 checklist

- [x] Quartz v5 vendored and configured (pt-BR, no analytics, self-hosted fonts)
- [x] PWA post-build step: vendoring, guards, manifest, icons, service worker, client UI
- [x] Offline end-to-end tests (18 passing locally)
- [x] Deploy workflow (build → PWA → tests → Pages)
- [x] Pages enabled and first deploy green (2026-10-23); offline smoke test against production passed
- [ ] Real-device check: install on iPhone and Android, airplane mode, update flow
- [ ] Final app name, icon and colors (currently placeholders: "CFBXVI", text icon)

## Open questions

- File naming for notes: ` - ` in titles becomes `---` in URLs. Pick a convention on the first real section.
- One note per section, or split long sections by topic? Decide on the first real section.
- `gh` CLI isn't installed on the ingest PC yet (needed for the PR step in Phase 2).
- Upstream PRs, so we can drop our patches (D-013): accent folding and i18n for the "no results" text in `quartz-community/search`; base path in `quartz-community/quartz-fonts`; "Properties" label in `note-properties`.

## Answered

- *How does v5 slugify accented titles?* It keeps the accents, lowercased. Works online and offline.
- *Does v5 search ignore accents?* Not by default; patched (D-013).
- *Plugin or post-build script for the PWA?* Post-build package (D-011).
