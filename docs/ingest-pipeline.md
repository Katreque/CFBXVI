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

## Steps (`/ingest <file-or-folder>`)

1. **Extract (deterministic).** `pipeline/` runs Docling on each file and produces raw Markdown plus images. Images are converted to WebP, resized, and written to `content/attachments/`, then embedded as `![[image.webp]]`.
2. **Curate (Claude Code).**
   - Fix headings, lists, tables and leftovers from the conversion.
   - Write frontmatter: `title`, `section`, `tags`, `aliases`, `source` (original file name).
   - Identify the important concepts in the text (Portuguese) and propose new `glossary.yml` entries with aliases covering word forms (plural, gender, common variants).
3. **Link (deterministic).** A linker script reads `glossary.yml` and:
   - turns the **first** mention of each concept in a note into `[[Conceito|texto original]]`;
   - adds the concept's tags to the frontmatter;
   - creates or updates the concept note in `content/conceitos/`.
   It is a script rather than an LLM step so that re-running it always gives the same result.
4. **Record.** Updates `sources.lock` (file name, content hash, generated note paths) so re-runs skip unchanged files and update changed ones.
5. **Deliver.** Creates a branch `ingest/<section>`, commits, and opens a PR with `gh`. The PR description lists the new notes and the new or changed glossary entries.

## Review

- The maintainers (the course owner and the teacher) review each PR on GitHub.
- The glossary diff deserves the most attention: it defines how everything gets linked.
- Merging to `master` deploys the site.

## Markdown conventions

- Obsidian-flavoured: `[[wikilinks]]`, `![[embeds]]`, YAML frontmatter, `#tags` only in frontmatter.
- Note titles keep Portuguese accents. Quartz keeps them in URLs too, lowercased: `Seção 01 - Introdução.md` becomes `secoes/seção-01---introdução`. These URLs work offline (tested). Note that ` - ` turns into `---`, so prefer file names without it, e.g. `01 Introdução.md`. *(Decide on the first real section.)*
- **An alias must never equal the note's own title (case-insensitive).** Quartz creates a redirect page for each alias. An alias such as `função` on the note `Função` takes over the note's URL: wikilinks then point to the redirect, and **backlinks disappear**. The linker must validate this, and also that no alias collides with another note's title.
- Every folder gets an `index.md` with a Portuguese `title` (otherwise breadcrumbs show the raw folder name).
- One note per course section, unless a section is long enough to split by topic. *(Open question; decide on the first real section.)*

## `glossary.yml` shape (draft)

```yaml
- concept: Célula
  aliases: [células, celular, celulares]   # never "célula" itself (see conventions)
  tags: [biologia/citologia]
  description: Unidade estrutural e funcional dos seres vivos.
```
