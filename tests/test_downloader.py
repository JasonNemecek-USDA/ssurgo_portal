from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from ssurgo_portal.downloader import DownloadError, download_file


class DownloadFileTests(unittest.TestCase):
    def test_invalid_scheme_raises_user_friendly_error(self) -> None:
        with self.assertRaises(DownloadError) as ctx:
            download_file("ftp://example.com/file.zip", "file.zip")

        self.assertIn("Invalid download URL", str(ctx.exception))

    @patch("ssurgo_portal.downloader.urlretrieve")
    def test_http_failure_contains_status_code(self, mock_retrieve) -> None:  # type: ignore[no-untyped-def]
        mock_retrieve.side_effect = HTTPError(
            url="https://example.com/file.zip",
            code=404,
            msg="Not Found",
            hdrs=None,
            fp=None,
        )

        with self.assertRaises(DownloadError) as ctx:
            download_file("https://example.com/file.zip", "file.zip")

        self.assertIn("HTTP 404", str(ctx.exception))

    @patch("ssurgo_portal.downloader.urlretrieve")
    def test_network_failure_contains_reason(self, mock_retrieve) -> None:  # type: ignore[no-untyped-def]
        mock_retrieve.side_effect = URLError("timed out")

        with self.assertRaises(DownloadError) as ctx:
            download_file("https://example.com/file.zip", "file.zip")

        self.assertIn("timed out", str(ctx.exception))

    @patch("ssurgo_portal.downloader.urlretrieve")
    def test_success_returns_destination_path(self, mock_retrieve) -> None:  # type: ignore[no-untyped-def]
        def _fake_download(url: str, destination: Path) -> tuple[Path, None]:
            destination.write_bytes(b"ok")
            return destination, None

        mock_retrieve.side_effect = _fake_download

        with tempfile.TemporaryDirectory() as tmpdir:
            destination = Path(tmpdir) / "download.zip"
            result = download_file("https://example.com/file.zip", destination)

        self.assertEqual(result.name, "download.zip")


if __name__ == "__main__":
    unittest.main()
