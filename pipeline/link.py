"""Deterministic linker: applies glossary.yml to the notes in content/.

For every note it turns the first mention of each concept into a wikilink,
adds the concept's tags to the frontmatter, and creates or updates the
concept notes in content/conceitos/. Running it twice gives the same result.

    python pipeline/link.py           # validate the glossary and apply it
    python pipeline/link.py --check   # exit 1 if anything would change (nothing is written)
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

import notes

GLOSSARY = notes.REPO / "glossary.yml"
CONCEPT_TAG = "conceito"
BAD_NAME_CHARS = set('/\\:*?"<>|#^[]')

# Spans the linker must never touch: links, embeds, code, HTML, URLs, inline math, callout markers.
PROTECTED = re.compile(
    r"!?\[\[.*?\]\]"  # wikilinks and embeds
    r"|!?\[[^\]]*\]\([^)]*\)"  # Markdown links and images
    r"|`[^`]*`"  # inline code
    r"|<[^>]+>"  # HTML tags
    r"|https?://\S+"  # bare URLs
    r"|\$[^$]+\$"  # inline math
)
WIKILINK = re.compile(r"!?\[\[([^\]|#\\]+)")
FENCE = re.compile(r"^\s*(```|~~~)")
CALLOUT_HEADER = re.compile(r"^\s*>\s*\[!")


@dataclass
class Concept:
    name: str
    aliases: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    description: str = ""

    @property
    def terms(self) -> list[str]:
        return [self.name, *self.aliases]


def load_glossary(path: Path = GLOSSARY) -> list[Concept]:
    if not path.exists():
        return []
    entries = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    return [
        Concept(
            name=str(e.get("concept", "")).strip(),
            aliases=[str(a).strip() for a in notes.as_list(e.get("aliases"))],
            tags=[str(t).strip() for t in notes.as_list(e.get("tags"))],
            description=str(e.get("description") or "").strip(),
        )
        for e in entries
    ]


def concept_path(concept: Concept, content: Path) -> Path:
    return content / "conceitos" / f"{concept.name}.md"


def validate(glossary: list[Concept], content: Path) -> list[str]:
    """Return every problem found. Aliases are checked against note titles because Quartz
    turns each alias into a redirect page: an alias equal to a title takes over that URL."""
    errors = []
    owners: dict[str, str] = {}  # casefolded term -> concept that uses it
    for c in glossary:
        if not c.name:
            errors.append("an entry has no 'concept'")
            continue
        if BAD_NAME_CHARS & set(c.name):
            errors.append(f"{c.name}: the name can't be a file name (remove {''.join(sorted(BAD_NAME_CHARS & set(c.name)))})")
        for i, term in enumerate(c.terms):
            key = term.casefold()
            if not term:
                errors.append(f"{c.name}: empty alias")
            elif i and key == c.name.casefold():
                errors.append(f"{c.name}: alias '{term}' equals the concept's own name (it would hide its backlinks)")
            elif key in owners and owners[key] != c.name:
                errors.append(f"{c.name}: '{term}' is already used by {owners[key]}")
            elif key in owners:
                errors.append(f"{c.name}: alias '{term}' is listed twice")
            owners.setdefault(key, c.name)
        for tag in c.tags:
            if not tag or tag.startswith("#") or re.search(r"\s", tag):
                errors.append(f"{c.name}: tag '{tag}' must have no '#' or spaces")

    own_notes = {concept_path(c, content).resolve(): c.name for c in glossary if c.name}
    for path in notes.content_notes(content):
        meta, _ = notes.read(path)
        owner = own_notes.get(path.resolve())
        for title in {notes.title_of(path, meta).casefold(), path.stem.casefold()}:
            if title in owners and owners[title] != owner:
                rel = path.relative_to(content).as_posix()
                errors.append(f"{owners[title]}: '{title}' collides with the note {rel}")
    return errors


def _term_regex(glossary: list[Concept]) -> tuple[re.Pattern, dict[str, Concept]]:
    by_term = {t.casefold(): c for c in glossary for t in c.terms}
    # Longest first, so "função afim" wins over "função".
    alternatives = "|".join(re.escape(t) for t in sorted(by_term, key=len, reverse=True))
    return re.compile(rf"(?<![\w-])({alternatives})(?![\w-])", re.IGNORECASE), by_term


def link_body(body: str, glossary: list[Concept], skip: str | None = None) -> tuple[str, list[Concept]]:
    """Link the first unlinked mention of each concept. Returns the new body and the concepts
    the note mentions (linked now or before). `skip` is the concept the note itself defines."""
    if not glossary:
        return body, []
    pattern, by_term = _term_regex(glossary)
    mentioned: dict[str, Concept] = {}
    for m in WIKILINK.finditer(body):
        c = by_term.get(m.group(1).strip().casefold())
        if c:
            mentioned[c.name] = c

    def replace(m: re.Match, in_table: bool) -> str:
        c = by_term[m.group(1).casefold()]
        if c.name == skip or c.name in mentioned:
            return m.group(0)
        mentioned[c.name] = c
        text = m.group(0)
        if text == c.name:
            return f"[[{c.name}]]"
        sep = "\\|" if in_table else "|"  # an unescaped | would split the table cell
        return f"[[{c.name}{sep}{text}]]"

    out, in_fence, in_math = [], False, False
    for line in body.split("\n"):
        if FENCE.match(line):
            in_fence = not in_fence
        elif line.strip() == "$$":
            in_math = not in_math
        elif not (in_fence or in_math or line.lstrip().startswith("#") or CALLOUT_HEADER.match(line)):
            in_table = line.lstrip().startswith("|")
            parts, last = [], 0
            for p in PROTECTED.finditer(line):
                parts.append(pattern.sub(lambda m: replace(m, in_table), line[last : p.start()]))
                parts.append(p.group(0))
                last = p.end()
            parts.append(pattern.sub(lambda m: replace(m, in_table), line[last:]))
            line = "".join(parts)
        out.append(line)
    found = [c for c in glossary if c.name in mentioned and c.name != skip]
    return "\n".join(out), found


def merge_tags(existing, extra: list[str]) -> list[str]:
    tags = [str(t) for t in notes.as_list(existing)]
    return list(dict.fromkeys(tags + extra))


def concept_note(c: Concept, path: Path) -> tuple[dict, str]:
    """The concept's note: title, aliases and tags are owned by the glossary. The body is only
    written when the note is empty, so hand edits to it survive."""
    meta, body = notes.read(path) if path.exists() else ({}, "")
    meta = {**meta, "title": c.name, "aliases": c.aliases, "tags": [CONCEPT_TAG, *c.tags]}
    if not c.aliases:
        del meta["aliases"]
    if not body.strip():
        body = f"\n{c.description}\n" if c.description else "\n"
    return meta, body


def run(content: Path, glossary: list[Concept], write: bool) -> list[Path]:
    """Apply the glossary. Returns the notes that changed (or would change)."""
    changed = []
    planned: dict[Path, tuple[dict, str]] = {concept_path(c, content): concept_note(c, concept_path(c, content)) for c in glossary}
    paths = sorted(set(notes.content_notes(content)) | set(planned))
    defines = {concept_path(c, content): c.name for c in glossary}
    for path in paths:
        current = notes.read(path) if path.exists() else None
        meta, body = planned.get(path) or current
        body, found = link_body(body, glossary, skip=defines.get(path))
        if found and path not in defines:
            meta = {**meta, "tags": merge_tags(meta.get("tags"), [t for c in found for t in c.tags])}
        # Compare parsed content, so a note we don't change keeps its hand-written formatting.
        if (meta, body) != current:
            changed.append(path)
            if write:
                notes.write(path, meta, body)
    return changed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="report changes without writing; exit 1 if any")
    parser.add_argument("--content", type=Path, default=notes.CONTENT, help=argparse.SUPPRESS)
    parser.add_argument("--glossary", type=Path, default=GLOSSARY, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    glossary = load_glossary(args.glossary)
    errors = validate(glossary, args.content)
    if errors:
        print("glossary.yml has problems:", *(f"  - {e}" for e in errors), sep="\n", file=sys.stderr)
        return 2
    changed = run(args.content, glossary, write=not args.check)
    for path in changed:
        print(("would change " if args.check else "updated ") + path.relative_to(args.content).as_posix())
    if not changed:
        print("nothing to change")
    return 1 if args.check and changed else 0


if __name__ == "__main__":
    sys.exit(main())
