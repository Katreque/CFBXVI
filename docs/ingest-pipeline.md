# Ingest Pipeline

Turns course source files into Obsidian-compatible Markdown for the digital garden. It runs **locally** on a maintainer's PC, driven by Claude Code, and its output reaches the site only through a reviewed pull request.

## Inputs

| Format | Notes |
|---|---|
| **DOCX** | Preferred. Use it whenever the original document exists. |
| **PDF** | Used when no DOCX exists. All PDFs are digitally generated from documents, so **no OCR is needed**. |
| **PPTX** | Slides. Legacy `.ppt` is not expected. |

Originals are **not** stored in this repo; they stay in the course's existing storage. The repo records only `sources.lock`.

Expected volume: about 20 course sections, roughly 1.2 MB of PDF each.

## Setup

Once per PC: Python 3.13, `gh` (logged in), then

```sh
py -3.13 -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt
```

Put the originals to ingest in `sources/` at the repo root. It is gitignored, so they never get committed (D-006).

## Steps (`/ingest <file-or-folder>`)

The `/ingest` skill (`.claude/skills/ingest/SKILL.md`) runs these steps in order. Each script can also be run by hand. `PY` below is `pipeline/.venv/Scripts/python`.

1. **Status.** `PY pipeline/lock.py status sources/...` classifies each file as `new`, `changed`, `unchanged` or `skipped`. A PDF next to a DOCX with the same name is skipped (D-005). Only new and changed files go on.
2. **Extract (deterministic).** `PY pipeline/extract.py <files>` runs Docling (no OCR) and writes the raw Markdown to `sources/_work/<file name>.md`, never straight into `content/` (D-002). Images:
   - converted to WebP (quality 80), at most 1200 px wide;
   - anything under 48 px on a side (bullets, icons, rules) is dropped;
   - named `<source slug>-<content hash>.webp`, so re-extracting gives the same names and identical images are stored once;
   - written to `content/attachments/` and embedded as `![[name.webp]]`.
   Slide and page breaks show up as `<!-- página -->`, to help the curation step.
3. **Curate (Claude Code).**
   - Fix headings, lists, tables and leftovers from the conversion. Don't add, summarise or rephrase content.
   - Split into notes and write frontmatter as described in "Markdown conventions" below.
   - Drop images that aren't content (logos repeated on every page, decorations), along with their files.
   - For a `changed` source, apply only what changed in the source, so hand fixes already in `content/` survive.
   - Identify the important concepts in the text (Portuguese) and propose new `glossary.yml` entries with aliases covering word forms (plural, gender, common variants).
4. **Link (deterministic).** `PY pipeline/link.py` validates `glossary.yml`, then:
   - turns the **first** mention of each concept in a note into `[[Conceito|texto original]]` (`[[Conceito]]` when the text is the name itself);
   - adds the concept's tags to the note's frontmatter;
   - creates or updates the concept note in `content/conceitos/`.
   It is a script rather than an LLM step so that re-running it always gives the same result. `--check` reports what would change without writing anything, and exits 1 if anything would.
5. **Record.** `PY pipeline/lock.py record <file> --notes ... --attachments ...` updates `sources.lock` (file name, content hash, date, generated notes and images).
6. **Deliver.** Creates a branch `ingest/<section>`, commits, and opens a PR with `gh`. The PR description lists the new notes, the new or changed glossary entries, and anything uncertain from curation.

## Linker rules

- **Matching:** whole words only, case-insensitive. A hyphen counts as part of a word, so "função-objetivo" doesn't match "função". The longest term wins ("funções afins" before "funções").
- **Never touched:** headings, callout title lines, code (fenced and inline), math (`$…$`, `$$` blocks), existing wikilinks and embeds, Markdown links, HTML tags and URLs.
- **Already linked:** a concept already linked anywhere in the note (by name or alias) isn't linked again.
- **Tables:** inside a table row the alias separator is written as `\|`, which Quartz accepts, so the cell doesn't split.
- **Self-links:** a concept note never links to itself.
- **Concept notes:** the glossary owns their `title`, `aliases` and `tags`. The body is written from `description` only when it's empty, so the teacher can expand it by hand.
- **Untouched notes:** a note with nothing to link or tag is left byte for byte.
- **Removals:** removing a concept or tag from the glossary doesn't unlink or untag existing notes. Clean those up by hand in the same PR.
- **Validation:** problems stop the run (exit 2) before anything is written. The checks:
  - an alias equal to its own concept;
  - a term used by two concepts, or an alias listed twice;
  - a term equal to another note's title or file name;
  - a concept name that can't be a file name;
  - tags with `#` or spaces.
- **CI:** the `glossary` job runs the linker tests and `link.py --check` on every PR, so a hand edit that breaks these rules fails before merge.

## Review

- The maintainers (the course owner and the teacher) review each PR on GitHub.
- The glossary diff deserves the most attention: it defines how everything gets linked.
- Merging to `master` deploys the site.

## Markdown conventions

- Obsidian-flavoured: `[[wikilinks]]`, `![[embeds]]`, YAML frontmatter, `#tags` only in frontmatter.
- **Layout (D-018):** the course is organised as module → subject (*disciplina*) → unit → chapter, and the folders follow it. Each chapter is one note.
  ```
  content/Módulo 3/
    index.md                              title: Módulo III – A Fé que se torna Vida
    Eclesiologia/
      index.md                            the subject's title page and presentation
      Unidade I/
        index.md                          title: Unidade I – Introdução à Eclesiologia (unit intro)
        01 O que é Eclesiologia.md        title: 1 – O que é Eclesiologia
  ```
  URLs follow the folders: `módulo-3/eclesiologia/unidade-i/01-o-que-é-eclesiologia`.
- **File names:** `NN <chapter title>.md`, with the chapter number zero-padded. Avoid ` - ` (it becomes `---` in URLs) and anything Windows can't store (`:`, `?`); shorten the name if needed, while the `title` keeps the full text. Commas are fine (tested offline).
- **Titles** carry the chapter number, `N – <title>`, because the explorer sorts by title (numerically). Titles that the source writes in all caps are turned into normal Portuguese capitalisation; other titles keep the source's capitalisation.
- **Frontmatter:**
  ```yaml
  title: 1 – O que é Eclesiologia
  module: 3
  discipline: Eclesiologia
  unit: 1          # unit pages and chapters
  chapter: 1       # chapters only
  tags: [eclesiologia]
  source: Eclesiologia.docx
  ```
- **Body:** the chapter heading isn't repeated (it's the title). Numbered subsections (`1.1 …`) are `##`.
- **Source styles** are rendered as follows:
  - epigraphs (`Epígrafe`) become blockquotes;
  - `Box Chave` boxes become `> [!tip]` callouts;
  - `Box Contexto` boxes become `> [!info]` callouts;
  - `Box Liturgia` boxes become `> [!note]` callouts;
  - the box's own title (`Título …` paragraph) becomes the callout title.
- **Sumário:** the source's table of contents is dropped, since the explorer and folder pages replace it.
- Note titles keep Portuguese accents. Quartz keeps them in URLs too, lowercased. These URLs work offline (tested).
- **An alias must never equal the note's own title (case-insensitive).** Quartz creates a redirect page for each alias. An alias such as `função` on the note `Função` takes over the note's URL: wikilinks then point to the redirect, and **backlinks disappear**. The linker must validate this, and also that no alias collides with another note's title.
- Every folder gets an `index.md` with a Portuguese `title` (otherwise breadcrumbs show the raw folder name).
- **Source typos** are not fixed during curation. They're listed in the PR for the teacher to fix in the original.

## `sources.lock` shape

```yaml
sources:
  Seção 01.docx:
    sha256: 3f2a…
    ingested: '2026-10-26'
    notes: [secoes/01 Introdução.md]
    attachments: [secao-01-1a2b3c4d.webp]
```

## `glossary.yml` shape

```yaml
- concept: Célula
  aliases: [células, celular, celulares]   # never "célula" itself (see conventions)
  tags: [biologia/citologia]
  description: Unidade estrutural e funcional dos seres vivos.
```
