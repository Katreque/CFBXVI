---
name: ingest
description: Ingest course source files (DOCX, PDF, PPTX) into the digital garden - extract with Docling, curate into notes, extend glossary.yml, run the linker, record sources.lock, and open a PR. Use when the user runs /ingest or asks to add or update course material from source files.
argument-hint: <file-or-folder under sources/>
---

# /ingest

Turns course source files into reviewed notes in `content/`. Full design: `docs/ingest-pipeline.md`. Decisions D-002, D-003, D-005 and D-006 in `docs/decisions.md` apply.

All commands run from the repo root. `PY` means `pipeline/.venv/Scripts/python` (Windows) or `pipeline/.venv/bin/python`.

## 0. Preflight

Stop and tell the user if any of these fail:

- The venv exists. If not: `py -3.13 -m venv pipeline/.venv` then `PY -m pip install -r pipeline/requirements.txt`.
- `gh auth status` succeeds (the PR step needs it).
- `git status` is clean and `master` is up to date with `origin/master`.
- The argument points to files under `sources/` (gitignored; originals never enter git, D-006).

## 1. Status

`PY pipeline/lock.py status <args>`. Ingest only the `new` and `changed` files. Report the `unchanged` and `skipped` ones to the user and leave them alone.

## 2. Extract

`PY pipeline/extract.py <files>`. Each file produces `sources/_work/<file name>.md` and images in `content/attachments/`. The first PDF run downloads Docling's layout models.

## 3. Curate

Read the raw Markdown and write the notes under `content/Módulo N/<Disciplina>/`, following the layout, naming and frontmatter in the "Markdown conventions" of `docs/ingest-pipeline.md`. **Faithfulness comes first: these are course materials. Don't add, summarise or rephrase content; fix only the structure.**

- Split the raw file with a script (by its headings), never by retyping the text. Then check that the notes' words match the raw extraction in order, apart from headings that moved into titles.
- Box and epigraph paragraphs are identified by their DOCX paragraph styles (`python-docx`, `paragraph.style.name`), not by guessing from the Markdown.
- Check suspected conversion errors against the DOCX (e.g. auto-numbered headings that lose their number). Real typos in the source stay as they are; list them in the PR.

- Fix headings (one `#`-level hierarchy, no skipped levels; the note title isn't repeated as a `#` heading), lists, tables, broken line wraps, page headers and footers, page numbers, `<!-- página -->` markers and other conversion leftovers.
- Keep every `![[image.webp]]` embed that shows content. Delete the attachment files of images you drop (logos repeated on every page, decorations).
- For a `changed` source: compare the new extraction with the existing notes and apply only what changed in the source. Hand fixes already in `content/` must survive (D-002).
- Don't add new notes to `index.md` pages: folder pages list them automatically.

## 4. Glossary

Identify the concepts a student should be able to look up, and add them to `glossary.yml` (Portuguese, D-009):

```yaml
- concept: Função          # singular, accents kept; becomes content/conceitos/Função.md
  aliases: [funções]       # inflected forms that appear in the text; never the concept itself
  tags: [matematica/funcoes]
  description: Relação que associa cada elemento do domínio a exatamente um elemento da imagem.
```

- Prefer fewer, meaningful concepts over linking every noun. Aim for the course's own vocabulary.
- Aliases cover plural, gender and common variants that actually occur. An alias must not be another note's title.
- Write the `description` from the course text, not from general knowledge.
- Never remove or rename existing entries without asking: that changes links across every section.

## 5. Link

`PY pipeline/link.py`. If it reports glossary problems, fix `glossary.yml` and run it again. Then run `PY pipeline/link.py --check`; it must say `nothing to change`.

## 6. Verify

- `PY -m pytest pipeline/tests -q`
- `node quartz/bootstrap-cli.mjs build` succeeds. Skim one generated page if anything looks off.

## 7. Record

`PY pipeline/lock.py record <source> --notes <paths relative to content/> --attachments <names>` for each ingested file.

## 8. Deliver

- Branch `ingest/<subject slug>` (e.g. `ingest/eclesiologia`), from `master`.
- One commit, message style `content: <subject> ingested` (the repo's commit style; no attribution trailers).
- `git push -u origin <branch>` then `gh pr create --base master` with a body that lists:
  - the source files and their status (new / changed);
  - the notes created or changed;
  - **the glossary entries added or changed**, since reviewers should look at those first;
  - anything you were unsure about while curating (unreadable tables, dropped images, ambiguous headings).
- Give the user the PR link. Merging deploys the site; that's the maintainers' call.
