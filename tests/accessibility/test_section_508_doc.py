from pathlib import Path


def test_section_508_document_exists() -> None:
    doc = Path("docs/compliance/section-508/README.md")
    assert doc.exists()
    assert "Section 508" in doc.read_text(encoding="utf-8")
