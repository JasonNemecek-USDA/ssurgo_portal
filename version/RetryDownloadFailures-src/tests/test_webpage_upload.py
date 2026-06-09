import io
import os
import sys
import tempfile
import unittest
from unittest import mock
from zipfile import ZipFile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dphost.webpage import _save_upload_stream
from dphost.webpage import _get_default_download_folder
from dphost.webpage import _validate_download_folder
from dphost.webpage import _run_download_preflight
from dphost.webpage import _find_missing_folders
from dphost.webpage import _can_extractall_without_overwrite
from dphost.webpage import _collect_runtime_telemetry


class TestUploadStreamSave(unittest.TestCase):
    def test_save_upload_stream_creates_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target_path = os.path.join(temp_dir, 'sample.bin')
            stream = io.BytesIO(b'abc123')

            result = _save_upload_stream(stream, target_path, overwrite=False)

            self.assertTrue(result['success'])
            self.assertFalse(result.get('alreadyExists', False))
            self.assertTrue(stream.closed)
            with open(target_path, 'rb') as fh:
                self.assertEqual(fh.read(), b'abc123')

    def test_save_upload_stream_reuses_existing_when_overwrite_false(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target_path = os.path.join(temp_dir, 'sample.bin')
            with open(target_path, 'wb') as fh:
                fh.write(b'old')

            stream = io.BytesIO(b'new')
            result = _save_upload_stream(stream, target_path, overwrite=False)

            self.assertTrue(result['success'])
            self.assertTrue(result.get('alreadyExists', False))
            self.assertTrue(stream.closed)
            with open(target_path, 'rb') as fh:
                self.assertEqual(fh.read(), b'old')

    def test_save_upload_stream_overwrites_existing_when_enabled(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target_path = os.path.join(temp_dir, 'sample.bin')
            with open(target_path, 'wb') as fh:
                fh.write(b'old')

            stream = io.BytesIO(b'new')
            result = _save_upload_stream(stream, target_path, overwrite=True)

            self.assertTrue(result['success'])
            self.assertTrue(stream.closed)
            with open(target_path, 'rb') as fh:
                self.assertEqual(fh.read(), b'new')

    def test_validate_download_folder_accepts_existing_writable_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            result = _validate_download_folder(temp_dir)

            self.assertTrue(result['success'])
            self.assertEqual(os.path.abspath(temp_dir), result.get('path'))

    def test_validate_download_folder_rejects_missing_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_path = os.path.join(temp_dir, 'missing-folder')
            result = _validate_download_folder(missing_path)

            self.assertFalse(result['success'])
            self.assertIn('does not exist', result['message'])

    def test_validate_download_folder_rejects_file_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target_path = os.path.join(temp_dir, 'not-a-folder.txt')
            with open(target_path, 'w', encoding='utf-8') as handle:
                handle.write('x')

            result = _validate_download_folder(target_path)

            self.assertFalse(result['success'])
            self.assertIn('not a folder', result['message'])

    def test_validate_download_folder_rejects_root_path(self):
        result = _validate_download_folder(os.path.abspath(os.sep))

        self.assertFalse(result['success'])
        self.assertIn('root of a drive/filesystem', result['message'])

    def test_run_download_preflight_passes_with_low_thresholds(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            result = _run_download_preflight(
                temp_dir,
                min_free_disk_mb=1,
                min_available_memory_mb=1,
            )

        self.assertTrue(result['success'])
        self.assertTrue(result['checks']['pathWritable'])
        self.assertTrue(result['checks']['diskEnough'])

    def test_run_download_preflight_fails_when_disk_threshold_too_high(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            result = _run_download_preflight(
                temp_dir,
                min_free_disk_mb=10**12,
                min_available_memory_mb=1,
            )

        self.assertFalse(result['success'])
        self.assertFalse(result['checks']['diskEnough'])

    def test_run_download_preflight_fails_for_missing_folder(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing_path = os.path.join(temp_dir, 'missing-folder')
            result = _run_download_preflight(missing_path)

        self.assertFalse(result['success'])
        self.assertFalse(result['checks']['pathWritable'])

    def test_get_default_download_folder_uses_home_downloads(self):
        with tempfile.TemporaryDirectory() as temp_home:
            expected = os.path.abspath(
                os.path.join(temp_home, 'Downloads', 'SSURGO')
            )
            with mock.patch(
                'dphost.webpage.os.path.expanduser',
                return_value=temp_home,
            ):
                with mock.patch(
                    'dphost.webpage.os.getcwd',
                    return_value=temp_home,
                ):
                    result = _get_default_download_folder()

        self.assertTrue(result['success'])
        self.assertEqual(expected, result['path'])

    def test_find_missing_folders_marks_non_string_and_missing_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            existing = temp_dir
            missing = os.path.join(temp_dir, 'missing')

            failed = _find_missing_folders(
                [None, '', '   ', existing, missing]
            )

            self.assertIn(None, failed)
            self.assertIn('', failed)
            self.assertIn('   ', failed)
            self.assertIn(missing, failed)
            self.assertNotIn(existing, failed)

    def test_find_missing_folders_returns_empty_for_existing_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            failed = _find_missing_folders([temp_dir])

            self.assertEqual([], failed)

    def test_can_extractall_without_overwrite_when_roots_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            zip_path = os.path.join(temp_dir, 'sample.zip')
            with ZipFile(zip_path, 'w') as zip_file:
                zip_file.writestr('AA001/tabular/mapunit.txt', 'sample')

            with ZipFile(zip_path, 'r') as zip_file:
                self.assertTrue(
                    _can_extractall_without_overwrite(zip_file, temp_dir)
                )

    def test_can_extractall_without_overwrite_when_roots_exist(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            os.makedirs(os.path.join(temp_dir, 'AA001'), exist_ok=True)
            zip_path = os.path.join(temp_dir, 'sample.zip')
            with ZipFile(zip_path, 'w') as zip_file:
                zip_file.writestr('AA001/tabular/mapunit.txt', 'sample')

            with ZipFile(zip_path, 'r') as zip_file:
                self.assertFalse(
                    _can_extractall_without_overwrite(zip_file, temp_dir)
                )

    def test_collect_runtime_telemetry_has_required_fields(self):
        telemetry = _collect_runtime_telemetry()

        self.assertIn('timestampUtc', telemetry)
        self.assertIn('pid', telemetry)
        self.assertIn('pythonVersion', telemetry)
        self.assertIn('platform', telemetry)

    def test_collect_runtime_telemetry_handles_psutil_failure(self):
        with mock.patch.dict(sys.modules, {'psutil': None}):
            telemetry = _collect_runtime_telemetry()

        self.assertIn('success', telemetry)
        if telemetry['success'] is False:
            self.assertIn('message', telemetry)


if __name__ == '__main__':
    unittest.main()
