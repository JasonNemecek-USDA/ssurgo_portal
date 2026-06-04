from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

import pytest

from ssurgo_portal.downloader import DownloadError, download_to_file


def test_download_failure_has_clear_message(tmp_path: Path) -> None:
    destination = tmp_path / "download.bin"

    with patch("ssurgo_portal.downloader.urlopen", side_effect=URLError("offline")):
        with pytest.raises(DownloadError, match="Download failed"):
            download_to_file("https://example.invalid/file", destination)
