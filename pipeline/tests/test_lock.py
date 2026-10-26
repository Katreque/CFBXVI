import lock


def touch(path, data=b"x"):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def test_collect_prefers_docx_and_skips_other_files(tmp_path):
    docx = touch(tmp_path / "s01.docx")
    pdf = touch(tmp_path / "s01.pdf")
    other_pdf = touch(tmp_path / "s02.pdf")
    slides = touch(tmp_path / "sub" / "s03.pptx")
    touch(tmp_path / "~$s01.docx")
    touch(tmp_path / "_work" / "s01.docx.md")
    txt = touch(tmp_path / "notas.txt")

    files, skipped = lock.collect([tmp_path])
    assert files == [docx, other_pdf, slides]
    assert dict(skipped) == {
        txt: "unsupported format .txt",
        pdf: "the DOCX with the same name is used instead",
    }


def test_status_and_record_round_trip(tmp_path):
    src = touch(tmp_path / "Seção 01.docx", b"v1")
    lock_file = tmp_path / "sources.lock"

    assert lock.status([src], lock.load(lock_file)) == [(src, "new")]

    lock.save(lock.record({}, src, ["secoes/b.md", "secoes/a.md"], ["x.webp"], "2026-10-26"), lock_file)
    entries = lock.load(lock_file)
    assert entries["Seção 01.docx"]["notes"] == ["secoes/a.md", "secoes/b.md"]
    assert entries["Seção 01.docx"]["attachments"] == ["x.webp"]
    assert "Seção 01.docx" in lock_file.read_text(encoding="utf-8")  # accents kept readable
    assert lock.status([src], entries) == [(src, "unchanged")]

    src.write_bytes(b"v2")
    assert lock.status([src], entries) == [(src, "changed")]
