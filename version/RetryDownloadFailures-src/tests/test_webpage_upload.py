import io
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock
from zipfile import ZipFile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import dphost.webpage as webpage_module

from dphost.webpage import _save_upload_stream
from dphost.webpage import _close_request_uploads
from dphost.webpage import _get_default_download_folder
from dphost.webpage import _validate_download_folder
from dphost.webpage import _run_download_preflight
from dphost.webpage import _find_missing_folders
from dphost.webpage import _can_extractall_without_overwrite
from dphost.webpage import _collect_runtime_telemetry
from dphost.webpage import _write_tlogger_message


class _DummyResponse:
    def __init__(self):
        self.body = None
        self.content_type = None
        self.headers = {}

    def set_header(self, key, value):
        self.headers[key] = value


class TestUploadStreamSave(unittest.TestCase):
    def test_close_request_uploads_closes_each_upload_stream(self):
        stream_one = io.BytesIO(b'one')
        stream_two = io.BytesIO(b'two')
        uploads = {
            'first': SimpleNamespace(file=stream_one),
            'second': SimpleNamespace(file=stream_two),
        }

        _close_request_uploads(uploads)

        self.assertTrue(stream_one.closed)
        self.assertTrue(stream_two.closed)

    def test_close_request_uploads_handles_nested_upload_lists(self):
        stream_one = io.BytesIO(b'one')
        stream_two = io.BytesIO(b'two')
        uploads = {
            'batch': [
                SimpleNamespace(file=stream_one),
                SimpleNamespace(file=stream_two),
            ]
        }

        _close_request_uploads(uploads)

        self.assertTrue(stream_one.closed)
        self.assertTrue(stream_two.closed)

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

    def test_write_tlogger_message_defaults_unknown_type_to_info(self):
        with mock.patch('dphost.webpage.tlogger.info') as info_mock:
            level = _write_tlogger_message('unexpected-level', 'hello world')

        self.assertEqual('info', level)
        info_mock.assert_called_once_with('hello world')

    def test_write_tlogger_message_routes_warning_level(self):
        with mock.patch('dphost.webpage.tlogger.warning') as warning_mock:
            level = _write_tlogger_message('warning', 'disk space low')

        self.assertEqual('warning', level)
        warning_mock.assert_called_once_with('disk space low')


class TestStaticRouteHeaders(unittest.TestCase):
    def test_server_uswds_javascript_non_pyz_uses_js_mimetype(self):
        with mock.patch('dphost.webpage.config.isPyzFile', False):
            with mock.patch('dphost.webpage._set_no_cache_headers') as no_cache:
                with mock.patch('dphost.webpage.static_file') as static_file:
                    static_file.return_value = 'ok'

                    result = webpage_module.server_uswds_javascript(
                        'uswds.min.js'
                    )

        self.assertEqual('ok', result)
        no_cache.assert_called_once()
        static_file.assert_called_once_with(
            'uswds.min.js',
            webpage_module.fullPath + '/resources/uswds/javascript/',
            mimetype=webpage_module.JS_MIME_TYPE,
        )

    def test_get_leaflet_javascript_non_pyz_uses_js_mimetype(self):
        with mock.patch('dphost.webpage.config.isPyzFile', False):
            with mock.patch('dphost.webpage._set_no_cache_headers') as no_cache:
                with mock.patch('dphost.webpage.static_file') as static_file:
                    static_file.return_value = 'ok'

                    result = webpage_module.get_leaflet_javascript('leaflet.js')

        self.assertEqual('ok', result)
        no_cache.assert_called_once()
        static_file.assert_called_once_with(
            'leaflet.js',
            webpage_module.fullPath + '/resources/leaflet/javascript/',
            mimetype=webpage_module.JS_MIME_TYPE,
        )

    def test_get_uswds_css_non_pyz_uses_css_mimetype(self):
        with mock.patch('dphost.webpage.config.isPyzFile', False):
            with mock.patch('dphost.webpage._set_no_cache_headers') as no_cache:
                with mock.patch('dphost.webpage.static_file') as static_file:
                    static_file.return_value = 'ok'

                    result = webpage_module.get_uswds_css('styles.css')

        self.assertEqual('ok', result)
        no_cache.assert_called_once()
        static_file.assert_called_once_with(
            'styles.css',
            webpage_module.fullPath + '/resources/uswds/css/',
            mimetype=webpage_module.CSS_MIME_TYPE,
        )

    def test_server_uswds_javascript_pyz_sets_js_mime_and_no_cache(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            zip_path = os.path.join(temp_dir, 'runtime.pyz')
            with ZipFile(zip_path, 'w') as archive:
                archive.writestr(
                    'resources/uswds/javascript/uswds.min.js',
                    'console.log("ok")',
                )

            dummy_response = _DummyResponse()
            with mock.patch('dphost.webpage.config.isPyzFile', True):
                with mock.patch(
                    'dphost.webpage.zippath',
                    zip_path,
                    create=True,
                ):
                    with mock.patch('dphost.webpage.response', dummy_response):
                        result = webpage_module.server_uswds_javascript(
                            'uswds.min.js'
                        )

        self.assertIs(result, dummy_response)
        self.assertEqual(webpage_module.JS_MIME_TYPE, result.content_type)
        self.assertIn('console.log("ok")', result.body)
        self.assertEqual(
            'no-store, no-cache, must-revalidate, max-age=0',
            result.headers.get('Cache-Control'),
        )

    def test_get_leaflet_javascript_pyz_sets_js_mime_and_no_cache(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            zip_path = os.path.join(temp_dir, 'runtime.pyz')
            with ZipFile(zip_path, 'w') as archive:
                archive.writestr(
                    'resources/leaflet/javascript/leaflet.js',
                    'window.leaflet = true;',
                )

            dummy_response = _DummyResponse()
            with mock.patch('dphost.webpage.config.isPyzFile', True):
                with mock.patch(
                    'dphost.webpage.zippath',
                    zip_path,
                    create=True,
                ):
                    with mock.patch('dphost.webpage.response', dummy_response):
                        result = webpage_module.get_leaflet_javascript(
                            'leaflet.js'
                        )

        self.assertIs(result, dummy_response)
        self.assertEqual(webpage_module.JS_MIME_TYPE, result.content_type)
        self.assertIn('window.leaflet = true;', result.body)
        self.assertEqual(
            'no-store, no-cache, must-revalidate, max-age=0',
            result.headers.get('Cache-Control'),
        )


class TestBrowserLaunchStartupGate(unittest.TestCase):
    def test_run_server_starts_browser_thread_when_env_unset(self):
        with mock.patch.dict('dphost.webpage.os.environ', {}, clear=True):
            with mock.patch(
                'dphost.webpage._resolve_bind_host',
                return_value='127.0.0.1',
            ):
                with mock.patch('dphost.webpage.webbrowser.open') as open_mock:
                    with mock.patch(
                        'dphost.webpage.threading.Thread'
                    ) as thread_cls:
                        with mock.patch('dphost.webpage.run') as run_mock:
                            with mock.patch(
                                'dphost.webpage.config.isPyzFile',
                                False,
                            ):
                                webpage_module.run_server()

        thread_cls.assert_called_once_with(
            target=open_mock,
            args=['http://127.0.0.1:8083/startUp', 1, True],
            daemon=True,
        )
        thread_cls.return_value.start.assert_called_once_with()
        run_mock.assert_called_once_with(
            app=webpage_module.webpage,
            host='127.0.0.1',
            port=8083,
            debug=True,
            server=webpage_module.ThreadedWSGIRefServer,
        )

    def test_run_server_skips_browser_thread_when_disabled(self):
        with mock.patch.dict(
            'dphost.webpage.os.environ',
            {'SSURGO_LAUNCH_BROWSER': '0'},
            clear=False,
        ):
            with mock.patch(
                'dphost.webpage._resolve_bind_host',
                return_value='127.0.0.1',
            ):
                with mock.patch(
                    'dphost.webpage.threading.Thread'
                ) as thread_cls:
                    with mock.patch('dphost.webpage.run') as run_mock:
                        with mock.patch(
                            'dphost.webpage.config.isPyzFile',
                            False,
                        ):
                            webpage_module.run_server()

        thread_cls.assert_not_called()
        run_mock.assert_called_once_with(
            app=webpage_module.webpage,
            host='127.0.0.1',
            port=8083,
            debug=True,
            server=webpage_module.ThreadedWSGIRefServer,
        )

    def test_run_server_starts_browser_thread_when_enabled(self):
        with mock.patch.dict(
            'dphost.webpage.os.environ',
            {'SSURGO_LAUNCH_BROWSER': '1'},
            clear=False,
        ):
            with mock.patch(
                'dphost.webpage._resolve_bind_host',
                return_value='127.0.0.1',
            ):
                with mock.patch('dphost.webpage.webbrowser.open') as open_mock:
                    with mock.patch(
                        'dphost.webpage.threading.Thread'
                    ) as thread_cls:
                        with mock.patch('dphost.webpage.run') as run_mock:
                            with mock.patch(
                                'dphost.webpage.config.isPyzFile',
                                False,
                            ):
                                webpage_module.run_server()

        thread_cls.assert_called_once_with(
            target=open_mock,
            args=['http://127.0.0.1:8083/startUp', 1, True],
            daemon=True,
        )
        thread_cls.return_value.start.assert_called_once_with()
        run_mock.assert_called_once_with(
            app=webpage_module.webpage,
            host='127.0.0.1',
            port=8083,
            debug=True,
            server=webpage_module.ThreadedWSGIRefServer,
        )


if __name__ == '__main__':
    unittest.main()
