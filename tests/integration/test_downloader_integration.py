from pathlib import Path

from ssurgo_portal.downloader import download_to_file


def test_download_file_url(tmp_path: Path) -> None:
    source = tmp_path / "source.txt"
    source.write_text("soil-data", encoding="utf-8")

    destination = tmp_path / "out" / "download.txt"
    result = download_to_file(source.resolve().as_uri(), destination)

    assert result.read_text(encoding="utf-8") == "soil-data"
