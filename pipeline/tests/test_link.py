from pathlib import Path

import pytest

import link
import notes
from link import Concept

FUNCAO = Concept("Função", aliases=["funções"], tags=["matematica/funcoes"], description="Relação entre conjuntos.")
DOMINIO = Concept("Domínio", aliases=["domínios"], tags=["matematica/funcoes"])
AFIM = Concept("Função afim", aliases=["funções afins"], tags=["matematica/funcoes"])


def write_note(root: Path, rel: str, text: str) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def body_of(path: Path) -> str:
    return notes.read(path)[1]


def test_links_first_mention_only_keeping_original_text():
    body, found = link.link_body("A função e a FUNÇÃO.\nOutra função.", [FUNCAO])
    assert body == "A [[Função|função]] e a FUNÇÃO.\nOutra função."
    assert found == [FUNCAO]


def test_exact_name_gets_a_plain_link():
    assert link.link_body("Uma Função.", [FUNCAO])[0] == "Uma [[Função]]."


def test_aliases_match_and_longest_term_wins():
    body, _ = link.link_body("Estudamos funções afins e funções.", [FUNCAO, AFIM])
    assert body == "Estudamos [[Função afim|funções afins]] e [[Função|funções]]."


def test_whole_words_only():
    body, _ = link.link_body("Funcional, disfunção, função-objetivo.", [FUNCAO])
    assert body == "Funcional, disfunção, função-objetivo."


def test_protected_spans_and_lines_are_untouched():
    text = "\n".join(
        [
            "# Função",
            "> [!note] Função",
            "`função` [função](https://x.org/função) ![[função.webp]] <b title='função'>",
            "```",
            "função",
            "```",
            "$$",
            "função",
            "$$",
            "Agora sim: função.",
        ]
    )
    body, _ = link.link_body(text, [FUNCAO])
    assert body.splitlines()[:-1] == text.splitlines()[:-1]
    assert body.splitlines()[-1] == "Agora sim: [[Função|função]]."


def test_existing_link_counts_as_first_mention():
    body, found = link.link_body("Ver [[Função|a função]]. A função.", [FUNCAO])
    assert body == "Ver [[Função|a função]]. A função."
    assert found == [FUNCAO]


def test_links_to_an_alias_count_too():
    assert link.link_body("[[funções]] e função.", [FUNCAO])[0] == "[[funções]] e função."


def test_table_rows_escape_the_pipe():
    body, _ = link.link_body("| Termo | x |\n|---|---|\n| função | y |", [FUNCAO])
    assert body.splitlines()[-1] == "| [[Função\\|função]] | y |"


def test_concept_note_does_not_link_itself():
    body, found = link.link_body("Uma função de domínios.", [FUNCAO, DOMINIO], skip="Função")
    assert body == "Uma função de [[Domínio|domínios]]."
    assert found == [DOMINIO]


@pytest.mark.parametrize(
    "glossary, message",
    [
        ([Concept("Função", aliases=["função"])], "equals the concept's own name"),
        ([FUNCAO, Concept("Mapa", aliases=["funções"])], "already used by Função"),
        ([Concept("Função", aliases=["f", "f"])], "listed twice"),
        ([Concept("A/B")], "can't be a file name"),
        ([Concept("X", tags=["#tag"])], "must have no '#'"),
    ],
)
def test_validation_errors(tmp_path, glossary, message):
    errors = link.validate(glossary, tmp_path)
    assert any(message in e for e in errors), errors


def test_alias_colliding_with_a_note_title_is_an_error(tmp_path):
    write_note(tmp_path, "secoes/01 Introdução.md", "---\ntitle: Funções\n---\nTexto.\n")
    errors = link.validate([FUNCAO], tmp_path)
    assert errors == ["Função: 'funções' collides with the note secoes/01 Introdução.md"]


def test_concept_note_does_not_collide_with_itself(tmp_path):
    write_note(tmp_path, "conceitos/Função.md", "---\ntitle: Função\n---\n")
    assert link.validate([FUNCAO], tmp_path) == []


def test_run_links_tags_and_creates_concept_notes(tmp_path):
    section = write_note(tmp_path, "secoes/01.md", "---\ntitle: '01'\ntags: [secao]\n---\nA função e o domínio.\n")
    changed = link.run(tmp_path, [FUNCAO, DOMINIO], write=True)

    meta, body = notes.read(section)
    assert body == "A [[Função|função]] e o [[Domínio|domínio]].\n"
    assert meta["tags"] == ["secao", "matematica/funcoes"]

    concept = tmp_path / "conceitos" / "Função.md"
    assert concept.read_text(encoding="utf-8") == (
        "---\ntitle: Função\naliases: [funções]\ntags: [conceito, matematica/funcoes]\n---\n\nRelação entre conjuntos.\n"
    )
    assert set(changed) == {section, concept, tmp_path / "conceitos" / "Domínio.md"}


def test_run_is_idempotent(tmp_path):
    write_note(tmp_path, "secoes/01.md", "A função, o domínio e funções afins.\n")
    glossary = [FUNCAO, DOMINIO, AFIM]
    link.run(tmp_path, glossary, write=True)
    assert link.run(tmp_path, glossary, write=False) == []


def test_concept_body_edits_survive_but_metadata_follows_glossary(tmp_path):
    concept = write_note(tmp_path, "conceitos/Função.md", "---\ntitle: Velho\ntags: [antigo]\n---\nTexto do professor.\n")
    link.run(tmp_path, [FUNCAO], write=True)
    meta, body = notes.read(concept)
    assert body == "Texto do professor.\n"
    assert meta == {"title": "Função", "aliases": ["funções"], "tags": ["conceito", "matematica/funcoes"]}


def test_notes_without_concepts_are_left_byte_for_byte(tmp_path):
    text = "---\ntitle: Início\ntags:\n  - inicio\n---\n\nNada a ligar.\n"
    note = write_note(tmp_path, "index.md", text)
    assert link.run(tmp_path, [FUNCAO], write=True) == [tmp_path / "conceitos" / "Função.md"]
    assert note.read_text(encoding="utf-8") == text


def test_frontmatter_round_trip_keeps_block_style_for_scalars():
    meta = {"title": "Início", "section": 1, "tags": ["secao", "a/b"], "source": "x: y.docx"}
    assert notes.join(meta, "\nTexto.\n") == (
        "---\ntitle: Início\nsection: 1\ntags: [secao, a/b]\nsource: 'x: y.docx'\n---\n\nTexto.\n"
    )
    assert notes.split(notes.join(meta, "\nTexto.\n")) == (meta, "\nTexto.\n")


def test_check_mode_writes_nothing_and_exits_1(tmp_path):
    section = write_note(tmp_path, "secoes/01.md", "A função.\n")
    glossary = tmp_path / "glossary.yml"
    glossary.write_text("- concept: Função\n", encoding="utf-8")
    args = ["--check", "--content", str(tmp_path), "--glossary", str(glossary)]
    assert link.main(args) == 1
    assert section.read_text(encoding="utf-8") == "A função.\n"
    assert not (tmp_path / "conceitos").exists()


@pytest.mark.parametrize(
    "yaml_text, message",
    [
        ("- concept:\n  aliases: [x]\n", "an entry has no 'concept'"),
        ("- concept: Função\n  aliases: [~]\n", "empty alias"),
        ("- Função\n", "aren't 'concept: ...' mappings"),
        ("concept: Função\n", "must be a list"),
    ],
)
def test_malformed_glossary_is_a_validation_error(tmp_path, capsys, yaml_text, message):
    glossary = tmp_path / "glossary.yml"
    glossary.write_text(yaml_text, encoding="utf-8")
    assert link.main(["--content", str(tmp_path), "--glossary", str(glossary)]) == 2
    assert message in capsys.readouterr().err
    assert not (tmp_path / "conceitos").exists()


def test_crlf_and_empty_frontmatter_are_parsed():
    assert notes.split("---\r\ntitle: X\r\n---\r\nA função.\r\n") == ({"title": "X"}, "A função.\n")
    assert notes.split("---\n---\nTexto.\n") == ({}, "Texto.\n")


def test_crlf_note_keeps_its_frontmatter_when_linked(tmp_path):
    note = tmp_path / "secoes" / "01.md"
    note.parent.mkdir(parents=True)
    note.write_bytes("---\r\ntitle: A função\r\ntags: [secao]\r\n---\r\nA função.\r\n".encode())
    link.run(tmp_path, [FUNCAO], write=True)
    meta, body = notes.read(note)
    assert meta == {"title": "A função", "tags": ["secao", "matematica/funcoes"]}
    assert body == "A [[Função|função]].\n"


def test_invalid_glossary_exits_2_without_writing(tmp_path):
    section = write_note(tmp_path, "secoes/01.md", "A função.\n")
    glossary = tmp_path / "glossary.yml"
    glossary.write_text("- concept: Função\n  aliases: [função]\n", encoding="utf-8")
    assert link.main(["--content", str(tmp_path), "--glossary", str(glossary)]) == 2
    assert section.read_text(encoding="utf-8") == "A função.\n"
