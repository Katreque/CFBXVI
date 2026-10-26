# Roadmap

| Phase | Deliverable | Done when | Status |
|---|---|---|---|
| **1. Site + PWA** | Quartz v5 set up, pt-BR, a few sample notes, manifest, service worker, update prompt, iOS install guide, Pages deploy workflow | Installed on a real iPhone and Android phone, browsable in airplane mode | **Done** (2026-10-23) |
| **2. Ingest pipeline** | Docling extraction (DOCX/PDF/PPTX), `glossary.yml`, linker, `sources.lock`, `/ingest` skill, PR flow | One real section ingested and reviewed through a PR | **In progress**: Eclesiologia (Módulo III) ingested on branch `ingest/eclesiologia`; PR pending |
| **3. Hardening** | Lighthouse CI, image optimisation, Dependabot | CI checks green on every PR | Partly done: offline Playwright tests and the precache size budget already run in CI |
| **4. Bulk ingest** | All ~20 sections ingested; glossary reviewed with the teacher | Full course available offline | Not started |

## Phase 1 checklist

- [x] Quartz v5 vendored and configured (pt-BR, no analytics, self-hosted fonts)
- [x] PWA post-build step: vendoring, guards, manifest, icons, service worker, client UI
- [x] Offline end-to-end tests (18 passing locally)
- [x] Deploy workflow (build → PWA → tests → Pages)
- [x] Pages enabled and first deploy green (2026-10-23); offline smoke test against production passed
- [x] Real-device check on Android: install, airplane mode, update flow (2026-10-23)
- [x] Real-device check on iPhone: install, airplane mode, update flow (2026-10-23)
- [ ] Final app name, icon and colors (currently placeholders: "CFBXVI", text icon)

## Phase 2 checklist

- [x] `pipeline/extract.py`: Docling extraction for DOCX/PPTX (tested on generated files); WebP images
- [x] `pipeline/link.py`: glossary validation, first-mention linking, tags, concept notes, `--check`
- [x] `pipeline/lock.py`: `sources.lock` status and record; DOCX preferred over PDF
- [x] `/ingest` skill (`.claude/skills/ingest/SKILL.md`)
- [x] CI `glossary` job: linker tests + `link.py --check` on every PR
- [ ] PDF extraction checked on a real course PDF
- [ ] `gh` installed and logged in on the ingest PC
- [x] First real source ingested: `Eclesiologia.docx` (Módulo III), 14 chapters, 33 concepts (2026-10-26)
- [ ] Eclesiologia PR reviewed (glossary first) and merged
- [x] Sample notes (`Seção 01/02`, `Função`, `Domínio`) removed; offline tests use real pages
- [x] Layout and naming decided (D-018)

## Open questions

- Folder pages list pages by last-modified date (newest first). After a later edit to one chapter, that chapter jumps to the top of its unit's page. Consider a custom `sort` for `folder-page` (it's a JS option, not settable from YAML).
- Upstream PRs, so we can drop our patches (D-013): accent folding and i18n for the "no results" text in `quartz-community/search`; base path in `quartz-community/quartz-fonts`; "Properties" label in `note-properties`.

## Answered

- *File naming and note splitting?* Module → subject → unit folders, one note per chapter, `NN <title>.md` (D-018).
- *How does v5 slugify accented titles?* It keeps the accents, lowercased. Works online and offline.
- *Does v5 search ignore accents?* Not by default; patched (D-013).
- *Plugin or post-build script for the PWA?* Post-build package (D-011).
