import io

import pytest
from PIL import Image

import extract

docx = pytest.importorskip("docx")
pptx = pytest.importorskip("pptx")


def png(width=400, height=200, color=(200, 30, 30)) -> io.BytesIO:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, "PNG")
    buffer.seek(0)
    return buffer


@pytest.fixture(scope="module")
def convert():
    return extract.converter()


def test_slug_folds_accents():
    assert extract.slug("Seção 01 - Introdução") == "secao-01-introducao"


def test_to_webp_resizes_and_drops_tiny_images():
    assert extract.to_webp(Image.new("RGB", (20, 400))) is None
    big = Image.open(io.BytesIO(extract.to_webp(Image.new("RGB", (3000, 1500)))))
    assert (big.format, big.size) == ("WEBP", (1200, 600))


def test_to_webp_converts_palette_images_before_resizing():
    palette = Image.new("RGB", (2400, 200), (10, 120, 200)).convert("P")
    out = Image.open(io.BytesIO(extract.to_webp(palette)))
    assert out.size == (1200, 100)


class _Proxy:
    """A Docling document whose Markdown export drops the image placeholders."""

    def __init__(self, doc):
        self._doc = doc

    def __getattr__(self, name):
        return getattr(self._doc, name)

    def export_to_markdown(self, **kwargs):
        return self._doc.export_to_markdown(**kwargs).replace(extract.PLACEHOLDER, "")


def test_failed_extraction_writes_no_attachments(tmp_path, convert):
    document = docx.Document()
    document.add_paragraph("Texto.")
    document.add_picture(png())
    source = tmp_path / "s.docx"
    document.save(source)

    class BrokenConvert:
        def convert(self, path):
            result = convert.convert(path)
            return type("Result", (), {"document": _Proxy(result.document)})()

    with pytest.raises(RuntimeError, match="0 image placeholders but 1 pictures"):
        extract.extract(source, tmp_path / "work", tmp_path / "attachments", BrokenConvert())
    assert not (tmp_path / "attachments").exists()
    assert not (tmp_path / "work").exists()


def test_docx(tmp_path, convert):
    document = docx.Document()
    document.add_heading("Introdução às funções", level=1)
    document.add_paragraph("Uma função associa cada elemento do domínio a um único valor.")
    table = document.add_table(rows=2, cols=2)
    for cell, text in zip(table._cells, ["Termo", "Significado", "Entrada", "Valor do domínio"]):
        cell.text = text
    document.add_picture(png())
    document.add_picture(png(16, 16))  # decorative, dropped
    source = tmp_path / "Seção 01.docx"
    document.save(source)

    raw, names = extract.extract(source, tmp_path / "work", tmp_path / "attachments", convert)
    text = raw.read_text(encoding="utf-8")

    assert raw.name == "Seção 01.docx.md"
    assert "# Introdução às funções" in text
    assert "| Entrada" in text and "Valor do domínio" in text
    assert len(names) == 1 and names[0].startswith("secao-01-") and names[0].endswith(".webp")
    assert f"![[{names[0]}]]" in text
    assert extract.PLACEHOLDER not in text
    assert (tmp_path / "attachments" / names[0]).exists()

    # Same input, same output: image names come from their content.
    again, again_names = extract.extract(source, tmp_path / "work2", tmp_path / "attachments", convert)
    assert again_names == names and again.read_text(encoding="utf-8") == text


def test_pptx(tmp_path, convert):
    deck = pptx.Presentation()
    for title, body in [("Domínio", "Conjunto das entradas."), ("Imagem", "Conjunto das saídas.")]:
        slide = deck.slides.add_slide(deck.slide_layouts[1])
        slide.shapes.title.text = title
        slide.placeholders[1].text = body
    deck.slides[0].shapes.add_picture(png(color=(30, 30, 200)), 0, 0)
    source = tmp_path / "aula.pptx"
    deck.save(source)

    raw, names = extract.extract(source, tmp_path / "work", tmp_path / "attachments", convert)
    text = raw.read_text(encoding="utf-8")
    assert "Domínio" in text and "Conjunto das saídas." in text
    assert len(names) == 1 and f"![[{names[0]}]]" in text
