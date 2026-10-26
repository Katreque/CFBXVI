"""Extraction: DOCX / PDF / PPTX -> raw Markdown plus WebP images, using Docling.

    python pipeline/extract.py <file>... [--out sources/_work]

The raw Markdown goes to sources/_work/<file name>.md (gitignored), where it is curated into
content/ by hand or by Claude Code; it is never written to content/ directly (D-002). Images are
written to content/attachments/ and embedded as ![[name.webp]]. PDFs are digital, so no OCR (D-005).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import re
import sys
import unicodedata
from pathlib import Path

import notes
from lock import FORMATS

MAX_WIDTH = 1200  # px; enough for a phone screen at 2-3x
MIN_SIDE = 48  # px; anything smaller is a bullet, icon or rule, not content
WEBP_QUALITY = 80
PLACEHOLDER = "<!-- pipeline:image -->"
PAGE_BREAK = "<!-- página -->"


def slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-") or "img"


def to_webp(image) -> bytes | None:
    """Resize and encode an image as WebP. Returns None for images too small to be content."""
    if min(image.size) < MIN_SIDE:
        return None
    # Convert first: Pillow can only resize palette and 1-bit images with nearest-neighbour.
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "transparency" in image.info or image.mode in ("LA", "P") else "RGB")
    if image.width > MAX_WIDTH:
        image = image.resize((MAX_WIDTH, round(image.height * MAX_WIDTH / image.width)))
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=WEBP_QUALITY, method=6)
    return buffer.getvalue()


def converter():
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pdf = PdfPipelineOptions(do_ocr=False, do_table_structure=True, generate_picture_images=True, images_scale=2.0)
    return DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pdf)})


def extract(source: Path, out_dir: Path, attachments: Path, convert=None) -> tuple[Path, list[str]]:
    """Convert one file. Returns (raw Markdown path, attachment file names)."""
    from docling_core.types.doc import PictureItem

    doc = (convert or converter()).convert(source).document
    markdown = doc.export_to_markdown(image_placeholder=PLACEHOLDER, page_break_placeholder=PAGE_BREAK)

    embeds, images = [], {}  # images: file name -> WebP bytes
    for item, _ in doc.iterate_items():
        if not isinstance(item, PictureItem):
            continue
        image = item.get_image(doc)
        data = to_webp(image) if image is not None else None
        if data is None:
            embeds.append("")
            continue
        # Named by content, so re-extracting gives the same names and identical images are shared.
        name = f"{slug(source.stem)}-{hashlib.sha256(data).hexdigest()[:8]}.webp"
        images[name] = data
        embeds.append(f"![[{name}]]")

    # Check before writing anything, so a failed extraction leaves no orphan files in content/.
    if markdown.count(PLACEHOLDER) != len(embeds):
        raise RuntimeError(f"{source.name}: {markdown.count(PLACEHOLDER)} image placeholders but {len(embeds)} pictures")
    if images:
        attachments.mkdir(parents=True, exist_ok=True)
    for name, data in images.items():
        (attachments / name).write_bytes(data)
    names = list(images)
    for embed in embeds:
        markdown = markdown.replace(PLACEHOLDER, embed, 1)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip() + "\n"

    out_dir.mkdir(parents=True, exist_ok=True)
    raw = out_dir / f"{source.name}.md"
    raw.write_text(f"<!-- extraído de {source.name} -->\n\n{markdown}", encoding="utf-8", newline="\n")
    return raw, names


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, default=notes.WORK, help="where the raw Markdown goes")
    parser.add_argument("--attachments", type=Path, default=notes.ATTACHMENTS, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    bad = [f for f in args.files if not f.is_file() or f.suffix.lower() not in FORMATS]
    if bad:
        print("not a DOCX/PDF/PPTX file:", *bad, sep="\n  ", file=sys.stderr)
        return 2
    convert = converter()
    for f in args.files:
        raw, names = extract(f, args.out, args.attachments, convert)
        print(f"{f.name} -> {raw}  ({len(names)} images)")
        for name in names:
            print(f"  attachments/{name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
