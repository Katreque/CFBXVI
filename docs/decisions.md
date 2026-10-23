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
