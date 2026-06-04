import io
import os
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dlcore.SSURGODownloader import BulkDownloader


class FakeResponse:
    def __init__(self, content: bytes, status_code: int = 200):
        self.content = content
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            from requests import HTTPError

            raise HTTPError(f"HTTP status code {self.status_code}")

    def iter_content(self, chunk_size=8192):
        for i in range(0, len(self.content), chunk_size):
            yield self.content[i : i + chunk_size]


class TestSSURGODownloader(unittest.TestCase):
    def test_getdownload_detects_corrupt_zip(self):
        with tempfile.TemporaryDirectory() as output_dir:
            downloader = BulkDownloader(
                {
                    "downloaddir": output_dir,
                    "soilsurveyareas": [],
                    "overwriteflg": True,
                    "downloadretryattempts": 1,
                    "downloadretrydelayseconds": 0,
                }
            )

            with patch("dlcore.SSURGODownloader.requests.get", return_value=FakeResponse(b"not-a-zip")):
                result = downloader.GetDownload("CA101", "2023-01-01")

            self.assertEqual(result[0], 2)
            self.assertIn("Failed to unzip SSURGO file", result[1])
            self.assertIn("http", result[1].lower())
            self.assertEqual(os.listdir(output_dir), [])

    def test_getdownload_cleans_partial_output_for_corrupt_zip(self):
        with tempfile.TemporaryDirectory() as output_dir:
            partial_path = os.path.join(output_dir, "wss_SSA_CA101_[2023-01-01]")
            os.makedirs(partial_path, exist_ok=True)
            with open(os.path.join(partial_path, "dummy.txt"), "w", encoding="utf-8") as fh:
                fh.write("partial data")

            downloader = BulkDownloader(
                {
                    "downloaddir": output_dir,
                    "soilsurveyareas": [],
                    "overwriteflg": True,
                }
            )

            with patch("dlcore.SSURGODownloader.requests.get", return_value=FakeResponse(b"not-a-zip")):
                result = downloader.GetDownload("CA101", "2023-01-01")

            self.assertEqual(result[0], 2)
            self.assertFalse(os.path.exists(partial_path))
            self.assertEqual(os.listdir(output_dir), [])

    def test_getdownload_detects_mismatched_root_folder(self):
        with tempfile.TemporaryDirectory() as output_dir:
            fake_zip = io.BytesIO()
            with zipfile.ZipFile(fake_zip, mode="w") as zf:
                zf.writestr("wrong_root/spatial/dummy.txt", "data")
            fake_zip.seek(0)

            downloader = BulkDownloader(
                {
                    "downloaddir": output_dir,
                    "soilsurveyareas": [],
                    "overwriteflg": True,
                }
            )

            with patch("dlcore.SSURGODownloader.requests.get", return_value=FakeResponse(fake_zip.getvalue())):
                result = downloader.GetDownload("CA101", "2023-01-01")

            self.assertEqual(result[0], 2)
            self.assertFalse(os.listdir(output_dir))
            self.assertIn("Failed to unzip SSURGO file", result[1])

    def test_getdownload_uses_browser_headers_and_stream(self):
        with tempfile.TemporaryDirectory() as output_dir:
            downloader = BulkDownloader(
                {
                    "downloaddir": output_dir,
                    "soilsurveyareas": [],
                    "overwriteflg": True,
                }
            )

            fake_zip = io.BytesIO()
            with zipfile.ZipFile(fake_zip, mode="w") as zf:
                zf.writestr("CA101/spatial/dummy.txt", "data")
                zf.writestr("CA101/tabular/dummy.txt", "data")
            fake_zip.seek(0)
            fake_response = FakeResponse(fake_zip.getvalue())

            captured = {}

            def fake_get(url, timeout=None, stream=None, headers=None):
                captured["url"] = url
                captured["timeout"] = timeout
                captured["stream"] = stream
                captured["headers"] = headers
                return fake_response

            with patch("dlcore.SSURGODownloader.requests.get", side_effect=fake_get):
                result = downloader.GetDownload("CA101", "2023-01-01")

            self.assertEqual(result[0], 0)
            self.assertTrue(captured["stream"])
            self.assertIsInstance(captured["timeout"], tuple)
            self.assertIn("User-Agent", captured["headers"])
            self.assertEqual(captured["headers"]["Accept-Encoding"], "identity")

    def test_processsurvey_retries_and_succeeds_after_unzip_failure(self):
        with tempfile.TemporaryDirectory() as output_dir:
            downloader = BulkDownloader(
                {
                    "downloaddir": output_dir,
                    "soilsurveyareas": [],
                    "overwriteflg": True,
                }
            )

            with patch.object(
                downloader,
                "GetDownload",
                side_effect=[[2, "Failed to unzip SSURGO file"], [0, None]],
            ) as mocked_getdownload, patch("dlcore.SSURGODownloader.sleep", return_value=None):
                outcome, message = downloader.ProcessSurvey("CA101", ["2023-01-01", " Test Survey"])

            self.assertEqual(outcome, 0)
            self.assertIn("successfully downloaded", message.lower())
            self.assertEqual(mocked_getdownload.call_count, 2)

    def test_processsurvey_honors_configured_retry_attempts(self):
        with tempfile.TemporaryDirectory() as output_dir:
            downloader = BulkDownloader(
                {
                    "downloaddir": output_dir,
                    "soilsurveyareas": [],
                    "overwriteflg": True,
                    "downloadretryattempts": 4,
                    "downloadretrydelayseconds": 0,
                }
            )

            with patch.object(
                downloader,
                "GetDownload",
                side_effect=[[2, "unzip failed"]] * 4,
            ) as mocked_getdownload, patch("dlcore.SSURGODownloader.sleep", return_value=None):
                outcome, _ = downloader.ProcessSurvey("CA101", ["2023-01-01", " Test Survey"])

            self.assertEqual(outcome, 2)
            self.assertEqual(mocked_getdownload.call_count, 4)

    def test_bulkdownload_reports_failed_surveys(self):
        with tempfile.TemporaryDirectory() as output_dir:
            downloader = BulkDownloader(
                {
                    "downloaddir": output_dir,
                    "soilsurveyareas": [],
                    "overwriteflg": True,
                    "downloadretryattempts": 1,
                    "downloadretrydelayseconds": 0,
                }
            )
            downloader.getSSAString = lambda: None
            downloader.formattedSSAList = ["CA101,  2023-01-01,  Test Survey"]

            with patch("dlcore.SSURGODownloader.requests.get", return_value=FakeResponse(b"not-a-zip")):
                response = downloader.bulkDownload()

            self.assertEqual(response["status"], True)
            self.assertEqual(response["allimported"], False)
            self.assertEqual(response["failedSurveys"], ["CA101"])
            self.assertIn("failed to download or unzip", response["message"].lower())


if __name__ == "__main__":
    unittest.main()
