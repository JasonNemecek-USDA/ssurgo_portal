import os
import sys
import unittest
import importlib
from types import SimpleNamespace
from unittest import mock

sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    ),
)


class TestRuntimeStartupPaths(unittest.TestCase):
    @staticmethod
    def _get_main_module():
        return importlib.import_module("main")

    @staticmethod
    def _get_runmode_enum():
        return importlib.import_module("runmode").RunMode

    def _config_get(self, key):
        if key == "supportedPythonVersions":
            return ("3.9", "3.10", "3.11")
        return None

    def test_supported_python_310_starts_ui(self):
        # Mimic Alena's environment: Python 3.10 should run in-place.
        main = self._get_main_module()
        run_mode = self._get_runmode_enum()
        fake_version = SimpleNamespace(major=3, minor=10)
        captured_metadata = {}

        def capture_metadata(metadata):
            captured_metadata.update(metadata)

        with mock.patch.object(
            main.sys,
            "version_info",
            fake_version,
        ), mock.patch.object(
            main.sys,
            "executable",
            "C:/Python310/python.exe",
        ), mock.patch.object(
            main.config,
            "get",
            side_effect=self._config_get,
        ), mock.patch.object(
            main.config,
            "set",
        ), mock.patch.object(
            main,
            "getMode",
            return_value=(run_mode.SSURGO_PORTAL_UI, False),
        ), mock.patch.object(
            main,
            "initializeLogging",
        ), mock.patch.object(
            main,
            "log_runtime_startup_metadata",
            side_effect=capture_metadata,
        ), mock.patch.object(
            main,
            "start_supporting_file_refresh",
        ), mock.patch.object(
            main.webpage,
            "run_server",
        ) as run_server_mock, mock.patch.object(
            main,
            "tlogger",
            mock.Mock(),
        ), mock.patch.object(main, "windll", mock.Mock()):
            main.main(["main.py"])

        run_server_mock.assert_called_once()
        self.assertEqual(
            "using_supported_runtime",
            captured_metadata.get("runtimeAction"),
        )
        self.assertEqual(
            "3.10",
            captured_metadata.get("activePythonVersion"),
        )

    def test_python_above_311_relaunches_then_starts_on_311(self):
        # Mimic Jason's environment: Python > 3.11 should hand off to 3.11.
        main = self._get_main_module()
        run_mode = self._get_runmode_enum()
        unsupported_version = SimpleNamespace(major=3, minor=14)
        managed_version = SimpleNamespace(major=3, minor=11)
        managed_python = r"C:\runtime\venv311\Scripts\python.exe"
        captured_metadata = {}

        def capture_metadata(metadata):
            captured_metadata.update(metadata)

        with mock.patch.dict(main.os.environ, {}, clear=True):
            # Phase 1: unsupported runtime relaunch handoff.
            with mock.patch.object(
                main.sys,
                "version_info",
                unsupported_version,
            ), mock.patch.object(
                main.sys,
                "executable",
                "C:/Python314/python.exe",
            ), mock.patch.object(
                main.sys,
                "argv",
                ["main.py"],
            ), mock.patch.object(
                main.config,
                "get",
                side_effect=self._config_get,
            ), mock.patch.object(
                main,
                "_runtime_root_path",
                return_value=r"C:\runtime",
            ), mock.patch.object(
                main,
                "_env_python_path",
                return_value=managed_python,
            ), mock.patch.object(
                main.os.path,
                "isfile",
                return_value=True,
            ), mock.patch.object(
                main,
                "getMode",
            ) as get_mode_mock, mock.patch.object(
                main.os,
                "execv",
                side_effect=SystemExit(0),
            ) as execv_mock:
                with self.assertRaises(SystemExit):
                    main.main(["main.py"])

            execv_mock.assert_called_once_with(
                managed_python,
                [managed_python, "main.py"],
            )
            get_mode_mock.assert_not_called()

            # Phase 2: relaunched runtime continues through UI startup.
            with mock.patch.object(
                main.sys,
                "version_info",
                managed_version,
            ), mock.patch.object(
                main.sys,
                "executable",
                managed_python,
            ), mock.patch.object(
                main.config,
                "get",
                side_effect=self._config_get,
            ), mock.patch.object(
                main.config,
                "set",
            ), mock.patch.object(
                main,
                "getMode",
                return_value=(run_mode.SSURGO_PORTAL_UI, False),
            ), mock.patch.object(
                main,
                "initializeLogging",
            ), mock.patch.object(
                main,
                "log_runtime_startup_metadata",
                side_effect=capture_metadata,
            ), mock.patch.object(
                main,
                "start_supporting_file_refresh",
            ), mock.patch.object(
                main.webpage,
                "run_server",
            ) as run_server_mock, mock.patch.object(
                main,
                "tlogger",
                mock.Mock(),
            ), mock.patch.object(main, "windll", mock.Mock()):
                main.main(["main.py"])

        run_server_mock.assert_called_once()
        self.assertEqual(
            "using_supported_runtime",
            captured_metadata.get("runtimeAction"),
        )
        self.assertEqual(
            "existing_managed_environment",
            captured_metadata.get("relaunchContext", {}).get("strategy"),
        )
        self.assertEqual(
            "3.14",
            captured_metadata.get("relaunchContext", {}).get("fromVersion"),
        )
        self.assertEqual(
            "3.11",
            captured_metadata.get("relaunchContext", {}).get("toVersion"),
        )


if __name__ == "__main__":
    unittest.main()
