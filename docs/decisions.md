# Decision Log

Each entry records what was decided, why, and its consequences. Supersede an entry with a new one instead of rewriting it.

---

## D-001 · Quartz v5 as the site generator
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** Build the digital garden with Quartz v5.
**Why:** It natively renders Obsidian-flavoured Markdown (wikilinks, backlinks, graph, tags, search), outputs a static site, and has i18n.
**Consequences:** Config is YAML, plugins install via the CLI, Node 22 or newer. PWA support isn't included, so we add it ourselves (D-004).

## D-002 · Ingest output is committed; the CI build only renders
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** Conversion, tagging and linking happen at ingest time and the resulting Markdown is committed. CI never runs converters or LLMs.
**Why:** Reproducible, fast builds; LLM output can be reviewed before students see it; and the source files don't need to live in the repo.
**Consequences:** The generated Markdown in `content/` is the source of truth for the site. Fixes made by hand in `content/` are legitimate, and the pipeline must not silently overwrite them (handled through `sources.lock` and PR review).

## D-003 · Ingest runs locally via Claude Code and is delivered by PR
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** A Claude Code project skill (`/ingest`) runs the pipeline on a maintainer's PC and opens a PR. Claude Code handles curation and concept extraction; extraction and linking are deterministic scripts.
**Why:** Ingest is a curation process with a human in the loop anyway. Running locally avoids putting API keys and source files in CI.
**Consequences:** Ingest needs a local setup (Python, Docling, Claude Code, `gh`). The maintainers (owner and teacher) review every PR.

## D-004 · PWA via a Workbox-generated service worker, full precache
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** After the Quartz build, generate a service worker that precaches the whole site, with hashed revisions and an update prompt.
**Why:** The goal is complete offline access. The estimated total size (about 5–15 MB) makes a full precache practical on both iOS and Android.
**Consequences:** Every deploy changes the precache manifest, and clients download only the files that changed. Re-evaluate if the site grows past the size budget.

## D-005 · Accept DOCX, PDF and PPTX; prefer DOCX
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** The pipeline accepts DOCX, PDF and PPTX, using Docling for all three. When both a DOCX and its PDF exist, the DOCX wins.
**Why:** Some originals exist as DOCX, some only as PDF. DOCX keeps its structure, while PDF structure has to be rebuilt from the layout. All PDFs are digital, so no OCR is needed. All slides are already PPTX.
**Consequences:** No OCR dependency. Legacy `.ppt` isn't supported.

## D-006 · Source originals stay out of the repo
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** Don't commit DOCX/PDF/PPTX files. Track them in `sources.lock` (file name, hash, generated notes).
**Why:** They already live in the course's storage, and binaries would bloat the repo.
**Consequences:** Re-ingesting requires local access to the originals.

## D-007 · Public hosting on GitHub Pages, `master` as the default branch
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** Deploy to GitHub Pages through GitHub Actions on every push to `master`. No access control.
**Why:** The content is public, and Pages is free and simple.
**Consequences:** The site is served from a subpath for now, so `baseUrl` and the service worker scope must match it.

## D-008 · No custom domain yet; migrate later
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** Launch on `<user>.github.io/<repo>`. Move to a custom domain later.
**Why:** No domain is available yet, and the maintainers accept a one-time reinstall for students.
**Consequences:** Changing the origin resets offline storage and the install. The base URL lives in one config value, and the migration release adds a "moved, reinstall" banner on the old origin.

## D-009 · Portuguese (pt-BR) content and UI
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** Quartz locale `pt-BR`. Concept extraction, glossary and UI strings are in Portuguese.
**Consequences:** Search should ignore accents (to verify in v5). Glossary aliases must cover inflected word forms so the linker matches real text.

## D-010 · Vendor Quartz at a pinned commit, without its history
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** Copy Quartz v5 into the repo at a pinned upstream commit, without merging its git history. Upgrade by applying the upstream diff between pins (`docs/quartz-upgrades.md`).
**Why:** `npx quartz upgrade` is a `git pull` from upstream, so it needs shared history. That would bring in thousands of upstream commits, plus Quartz's own `docs/` folder, which would collide with ours on every upgrade.
**Consequences:** Upgrades are a documented manual step. Our additions live outside Quartz's files (`pwa/`, `docs/`, `content/`, `.github/`) to keep conflicts rare.

## D-011 · PWA as a separate post-build package (`pwa/`)
**Date:** 2026-10-23 · **Status:** Accepted · *Refines D-004*

**Decision:** The PWA layer is a standalone npm package in `pwa/` that processes `public/` after `npx quartz build`. It is not a Quartz plugin.
**Why:** v5 plugins each live in their own repo, which is a lot of overhead for one site-specific step. A separate package also keeps Quartz's `package.json` untouched (D-010).
**Consequences:** CI runs two build commands. Running `npx quartz build --serve` locally previews content without the PWA; `npm --prefix pwa run preview` serves the full build.

## D-012 · All assets served from our own origin; CI fails on third-party URLs
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:**
- Fonts are self-hosted (`quartz-fonts` `fontOrigin: selfHosted`).
- d3, pixi.js (graph view) and KaTeX (math) are installed from npm at pinned versions and served from the site, replacing Quartz's CDN URLs.
- The build fails if any known CDN origin remains in the output.
- Mermaid is disabled: converted DOCX/PPTX files don't contain diagrams, and its ESM build loads dozens of chunks.

**Why:** Anything loaded from a third party at runtime breaks offline. Pinned npm packages give lockfile integrity checks and Dependabot updates.
**Consequences:** About 1.2 MB of libraries are precached even on pages that don't use them, which is acceptable within the budget. If a Quartz upgrade adds a new CDN URL, the build fails until it's added to `pwa/config.mjs`.

## D-013 · Patch plugin output we can't configure, and fail loudly when a patch stops matching
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** `pwa/config.mjs` holds exact find/replace patches applied to Quartz's emitted JS. The build fails if any patch no longer matches. Current patches:
- search ignores accents ("funcao" finds "função");
- the search "no results" text is in Portuguese.

The post-build step also fixes plugins that emit root-absolute `/static/` links ignoring the base path (`quartz-fonts`).
**Why:** These are bugs or gaps in upstream plugins that matter for a Portuguese site served from a subpath.
**Consequences:** Every precached file gets a content revision, since patched files keep their hashed names. These fixes are good candidates for upstream PRs; once upstream fixes them, the patches can be removed.

## D-014 · Show tags, hide the properties panel; Portuguese UI labels
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** Hide the note-properties panel and show tags with `tag-list`. Breadcrumb root is "Início". Folders get an `index.md` with a Portuguese title.
**Why:** The properties panel title is hardcoded in English and shows metadata (such as aliases) that students don't need.

## D-015 · Phase 1 code review fixes
**Date:** 2026-10-23 · **Status:** Accepted · *Refines D-012, D-013*

**Decision:** Fixes from the Phase 1 review:
- **Update flow:** "first install vs. update" is decided by `reg.active`, not `controller` (null after a hard reload); a worker already installing at registration is tracked too.
- **Deploys:** only `master` deploys; manual runs on other branches build and test only.
- **Offline guard:** checks every external asset embedded by pages and stylesheets, not just known CDNs. Files Workbox would skip (over 10 MB) fail the build.
- **Install toast:** no longer reappears after "Instalar".
- **Shared base path:** derived in one place (`pwa/site.mjs`) for the build, the preview server and the tests.
- **Preview server:** hardened against malformed URLs and path traversal.

**Not changed:** search patches still match minified code (D-013). The build fails loudly when they stop matching, and the long-term fix is upstream PRs (see roadmap).

## D-016 · CI runs Quartz directly, not through `npx`
**Date:** 2026-10-23 · **Status:** Accepted

**Decision:** The workflow runs `node quartz/bootstrap-cli.mjs <command>` instead of `npx quartz <command>`. Restored the executable bit on `quartz/bootstrap-cli.mjs`, which was lost when Quartz was copied on Windows.
**Why:** After the first green deploy, two runs failed in "Install Quartz plugins" with exit code 127 (command not found). Running the script directly doesn't depend on how npm resolves the project's own bin, or on the npm cache restored between runs.
**Consequences:** When vendoring or upgrading Quartz from Windows, check that file modes match upstream (`git ls-files -s`). Locally, `npx quartz ...` still works.

## D-017 · Ingest pipeline implementation
**Date:** 2026-10-26 · **Status:** Accepted · *Refines D-002, D-003, D-005, D-006*

**Decision:**
- **Scripts:** `pipeline/` holds three Python scripts: `extract.py` (Docling), `link.py` (glossary linker) and `lock.py` (`sources.lock`). They run in a local venv on Python 3.13, with dependencies pinned in `pipeline/requirements.txt`.
- **Originals:** the files to ingest go in a gitignored `sources/` folder at the repo root.
- **Raw output:** extraction writes raw Markdown to `sources/_work/`, never to `content/`. Notes reach `content/` only through curation.
- **Images:** WebP at quality 80, at most 1200 px wide. Images under 48 px on a side are dropped. File names come from the image content, so re-extracting is stable and duplicates are stored once.
- **Concept notes:** the linker owns their title, aliases and tags. The body comes from the glossary `description` only when the note is empty.
- **Validation:** the linker checks the glossary and refuses to write anything if there's a problem.
- **CI:** a `glossary` job runs the linker tests and `link.py --check`. Deploys wait for it.

**Why:** Keeping raw output out of `content/` means hand fixes are never overwritten (D-002). Content-hashed image names make re-ingesting a changed file produce a reviewable diff. The CI check catches hand edits that would break links or hide backlinks, such as an alias equal to a note title. It needs only PyYAML, so Docling and LLMs stay out of CI.
**Consequences:** Removing a concept or tag from the glossary doesn't unlink or untag existing notes; that cleanup is done by hand. The first PDF extraction downloads Docling's layout models, so the ingest PC needs internet on that first run.

## D-018 · Course layout: module → subject → unit → one note per chapter
**Date:** 2026-10-26 · **Status:** Accepted · *Answers the file-naming and note-splitting questions left open in Phase 1*

**Decision:**
- **Folders and pages:** content is organised as `Módulo N/<Disciplina>/Unidade X/NN <capítulo>.md`. The subject's presentation is the subject's `index.md`, and each unit's introduction is the unit's `index.md`.
- **Titles:** chapter titles carry their number (`1 – O que é Eclesiologia`). All-caps source titles get normal capitalisation.
- **Frontmatter:** `module`, `discipline`, `unit` and `chapter` replace the draft `section` field.
- **Source styles:** the DOCX boxes become callouts (`Box Chave` → tip, `Box Contexto` → info, `Box Liturgia` → note) and epigraphs become blockquotes.
- **Sumário:** the source's table of contents is dropped.
- **Typos:** source typos are flagged in the PR, not fixed.
- **Samples:** the Phase 1 sample notes (`secoes/`, `Função`, `Domínio`) are removed, and the offline tests now use real pages.

**Why:** The first real source (Eclesiologia, Módulo III) is one 170 KB document with 4 units and 14 chapters of 8–16 KB. A note per chapter is a comfortable read on a phone and gives finer-grained backlinks. Folders that mirror the course make breadcrumbs and the explorer match how students know the material. Callouts keep the boxes visually distinct, as the authors intended.
**Consequences:** Quartz's folder pages sort by date and then alphabetically, not numerically; the explorer sorts numerically by title. Chapter numbers only collide alphabetically across 1–9 vs 10–14, and those never share a unit folder here, so order is correct for now. Revisit the folder-page sort when a unit has ten or more chapters, or if edits reorder pages by date.

## D-019 · Approved typo fixes go straight into the notes
**Date:** 2026-10-26 · **Status:** Accepted · *Refines D-018*

**Decision:** Curation still leaves source typos as they are and lists them in the PR. Once a maintainer approves a fix, it is made directly in the Markdown note, not in the original DOCX.
**Why:** Editing the original and re-ingesting is slow for one-word fixes, and the original lives outside the repo (D-006).
**Consequences:** The note and the original now differ. When that source is re-ingested, these fixes must be carried over like any other hand fix (D-002). The first ones, in Eclesiologia chapter 1: "(LG, 1" → "(LG, 1)", "A expresso" → "A expressão".

## D-020 · Dependabot for updates, cached Playwright browser, pinned runner
**Date:** 2026-10-26 · **Status:** Accepted

**Decision:** Dependabot opens weekly PRs for GitHub Actions, npm (Quartz at `/`, PWA at `/pwa`) and pip (`/pipeline`), with minor and patch updates grouped per ecosystem. Majors are ignored for the vendored Quartz dependencies. CI caches Playwright's Chromium per Playwright version, and jobs run on `ubuntu-24.04` instead of `ubuntu-latest`.
**Why:** Every version is pinned exactly, so nothing moves unless a PR moves it, and CI tests each one. Quartz majors belong to a Quartz upgrade (D-010). Downloading Chromium took about 10 of the build's 11 minutes. `ubuntu-latest` moved to a new Ubuntu release on its own in October 2026, and an OS change should be a reviewed PR.
**Consequences:** Docling and Pillow updates are not exercised by CI (D-002): run `pytest pipeline/tests` locally before merging them. A cache hit still installs Chromium's system packages (`playwright install-deps`). Moving to a newer Ubuntu is a manual one-line change.
