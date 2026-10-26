"""Reading and writing Markdown notes with YAML frontmatter, shared by the pipeline scripts."""

from __future__ import annotations

from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
CONTENT = REPO / "content"
CONCEPTS = CONTENT / "conceitos"
ATTACHMENTS = CONTENT / "attachments"


def split(text: str) -> tuple[dict, str]:
    """Return (frontmatter, body). A note without frontmatter gets an empty dict."""
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            return yaml.safe_load(text[4:end]) or {}, text[end + 5 :]
        if text.endswith("\n---"):
            return yaml.safe_load(text[4:-4]) or {}, ""
    return {}, text


def join(meta: dict, body: str) -> str:
    """Inverse of split. Lists of scalars are written inline, like `tags: [a, b]`."""
    if not meta:
        return body
    lines = []
    for key, value in meta.items():
        if isinstance(value, list) and all(not isinstance(v, (list, dict)) for v in value):
            inline = yaml.safe_dump(value, allow_unicode=True, default_flow_style=True, width=10_000).strip()
            lines.append(f"{key}: {inline}\n")
        else:
            lines.append(yaml.safe_dump({key: value}, allow_unicode=True, sort_keys=False, default_flow_style=False, width=10_000))
    return f"---\n{''.join(lines)}---\n{body}"


def read(path: Path) -> tuple[dict, str]:
    return split(path.read_text(encoding="utf-8"))


def write(path: Path, meta: dict, body: str) -> bool:
    """Write the note only if it changed. Returns True when the file was written."""
    text = join(meta, body)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return True


def title_of(path: Path, meta: dict) -> str:
    return str(meta.get("title") or path.stem)


def as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def content_notes(root: Path = CONTENT) -> list[Path]:
    """Every Markdown note in the vault, in a stable order."""
    return sorted(p for p in root.rglob("*.md") if ATTACHMENTS not in p.parents)
