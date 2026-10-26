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

    files, skipped = lock.collect([tmp_path], work=tmp_path / "_work")
    assert files == [docx, other_pdf, slides]
    assert dict(skipped) == {
        txt: "unsupported format .txt",
        pdf: "s01.docx is used instead",
    }


def test_a_pdf_passed_directly_is_replaced_by_its_docx(tmp_path):
    docx = touch(tmp_path / "s01.docx")
    pdf = touch(tmp_path / "s01.pdf")
    files, skipped = lock.collect([pdf], work=tmp_path / "_work")
    assert files == [docx]
    assert skipped == [(pdf, "s01.docx is used instead")]


def test_only_the_work_folder_is_ignored(tmp_path):
    # A course folder that happens to be called "_work" is still ingested.
    source = touch(tmp_path / "_work" / "s01.docx")
    raw = touch(tmp_path / "sources" / "_work" / "s01.docx.md")
    files, skipped = lock.collect([tmp_path], work=raw.parent)
    assert files == [source]
    assert skipped == []


def test_missing_paths_are_reported_not_crashed_on(tmp_path):
    missing = tmp_path / "Eclesiolgia.docx"
    assert lock.collect([missing], work=tmp_path / "_work") == ([], [(missing, "not found")])
    assert lock.main(["--lock", str(tmp_path / "sources.lock"), "status", str(missing)]) == 0


def test_record_rejects_a_missing_source(tmp_path, capsys):
    lock_file = tmp_path / "sources.lock"
    args = ["--lock", str(lock_file), "record", str(tmp_path / "nope.docx"), "--notes", "index.md"]
    assert lock.main(args) == 2
    assert "source file not found" in capsys.readouterr().err
    assert not lock_file.exists()


def test_record_stores_forward_slash_paths(tmp_path):
    src = touch(tmp_path / "s01.docx")
    entries = lock.record({}, src, ["Módulo 3\\Unidade I\\01 X.md"], [], "2026-10-26")
    assert entries["s01.docx"]["notes"] == ["Módulo 3/Unidade I/01 X.md"]


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
