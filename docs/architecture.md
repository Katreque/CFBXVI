# Architecture

## Goal

Students can read the full course material on their phones (Android and iOS) **with no internet connection**, after a single online visit. The material is a digital garden: notes are tagged and linked by concept, with backlinks, a graph and search.

## Overview

```
 Source files (DOCX / PDF / PPTX)          ← kept in the course's existing storage, NOT in this repo
          │
          ▼
 [1. Ingest pipeline]  runs locally, driven by Claude Code (/ingest)
          │  extract → curate → tag → link
          ▼
 Pull request with generated Markdown      ← reviewed by the course maintainers
          │  merge to master
          ▼
 [2. Quartz v5 build]  GitHub Actions
          │
          ▼
 [3. PWA layer]  manifest + generated service worker added after the build
          │
          ▼
 GitHub Pages  ──►  students' phones (installed PWA, fully offline)
```

These three parts stay separate. In particular, **conversion and tagging happen once, at ingest, and the output is committed.** The CI build only renders Markdown; it never calls an LLM or a converter. Builds stay fast and reproducible, and every change students see has been through review.

## Components

### 1. Ingest pipeline (local)
- **Extraction:** Docling turns DOCX, PDF and PPTX into raw Markdown plus images. DOCX is preferred when the original exists, because its structure survives intact. See [ingest-pipeline.md](ingest-pipeline.md).
- **Curation:** Claude Code cleans up the structure, writes frontmatter, identifies concepts and proposes glossary entries.
- **Linking:** a deterministic script adds `[[wikilinks]]` and tags from `glossary.yml`.
- **Delivery:** a branch and a PR, opened with `gh`.

### 2. Site (Quartz v5)
- Static site generator for Obsidian-flavoured Markdown: wikilinks, backlinks, graph, search, tags.
- Locale `pt-BR`.
- Config: `quartz.config.yaml`. Plugins are npm packages (`@quartz-community/*`), installed with `npx quartz plugin install`. Requires Node 22 or newer.
- Vendored at a pinned upstream commit (D-010, [quartz-upgrades.md](quartz-upgrades.md)).

### 3. PWA layer
- Web app manifest, icons, Apple meta tags.
- A standalone `pwa/` package runs **after** the Quartz build (D-011): it vendors CDN assets, then generates a Workbox service worker that precaches the entire site.
- An update prompt, a persistent-storage request and an iOS install guide.
- See [pwa-offline.md](pwa-offline.md).

### Hosting
- GitHub Pages, deployed by GitHub Actions on every push to `master`.
- The content is public, so no access control is needed.
- For now the site lives at `https://katreque.github.io/CFBXVI/` (a subpath). A custom domain is planned for later. See decision D-008 for what that migration means.

## Repo layout (target)

```
docs/                 # this documentation
content/              # Quartz input: generated + reviewed Markdown (Obsidian vault)
  attachments/        # images extracted from sources (WebP)
  conceitos/          # one note per concept (generated/updated by the linker)
glossary.yml          # controlled vocabulary: concepts, aliases, tags
sources.lock          # source file → hash → generated note(s); no originals stored
pipeline/             # Python: extract.py, link.py, lock.py, tests/ (venv in pipeline/.venv, gitignored)
sources/              # gitignored: originals to ingest + _work/ raw extractions
pwa/                  # PWA post-build package: build.mjs, config.mjs, src/ (sw, client), icons/, tests/
.claude/skills/ingest # the /ingest Claude Code skill
.github/workflows/    # deploy.yml: build → PWA → offline tests → Pages, plus glossary checks (PRs: build + tests only)
quartz/ ...           # Quartz v5 itself
```

> **Note:** the upstream Quartz repo ships its own `docs/` folder (Quartz's documentation site). We didn't vendor it; the Quartz docs remain available upstream and at quartz.jzhao.xyz.
