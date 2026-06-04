import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from ssurgo_portal.archive_handling import extract_ssurgo_archive


class ArchiveHandlingTests(unittest.TestCase):
    def test_extract_valid_zip_success(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            archive = workspace / "valid.zip"
            output = workspace / "out"

            with zipfile.ZipFile(archive, "w") as zipped:
                zipped.writestr("example.txt", "hello")

            result = extract_ssurgo_archive(archive, output)

            self.assertTrue(result.success)
            self.assertEqual(result.extracted_files, 1)
            self.assertTrue((output / "example.txt").exists())

    def test_extract_corrupt_zip_records_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            archive = workspace / "corrupt.zip"
            output = workspace / "out"
            failure_log = workspace / "failed_extractions.jsonl"
            archive.write_bytes(b"not-a-zip")

            result = extract_ssurgo_archive(
                archive,
                output,
                max_retries=1,
                failure_record_path=failure_log,
            )

            self.assertFalse(result.success)
            self.assertEqual(result.attempts, 2)
            self.assertIn("incomplete or corrupt", result.user_message.lower())
            self.assertTrue(failure_log.exists())

            lines = failure_log.read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(lines), 1)
            record = json.loads(lines[0])
            self.assertEqual(record["archive_path"], str(archive))
            self.assertEqual(record["attempts"], 2)


if __name__ == "__main__":
    unittest.main()
