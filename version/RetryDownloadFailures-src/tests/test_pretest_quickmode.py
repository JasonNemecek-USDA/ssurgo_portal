import json
import os
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock

# pylint: disable=wrong-import-position,import-error
sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..')
    ),
)


class TestPretestQuickModes(unittest.TestCase):
    @staticmethod
    def _get_dataloader():
        from dlcore.dataloader import dataloader

        return dataloader

    def _create_minimal_pretest_database(
        self,
        db_path: str,
        ssurgo_version: str = "1.0",
    ):
        conn = sqlite3.connect(db_path)
        try:
            conn.execute(
                "create table if not exists sacatalog "
                "(areasymbol text, saverest text)"
            )
            conn.execute(
                "create table if not exists systemtemplateinformation "
                "(name text, value text)"
            )
            conn.execute("delete from sacatalog")
            conn.execute("delete from systemtemplateinformation")
            conn.execute(
                "insert into sacatalog(areasymbol, saverest) values (?, ?)",
                ("WI055", ssurgo_version),
            )
            conn.execute(
                "insert into systemtemplateinformation(name, value) "
                "values (?, ?)",
                ("SSURGO Version", ssurgo_version),
            )
            conn.commit()
        finally:
            conn.close()

    def test_large_pretest_uses_indexed_mode(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            dataloader = self._get_dataloader()
            root = os.path.join(temp_dir, "root")
            os.makedirs(root, exist_ok=True)

            db_path = os.path.join(temp_dir, "portal.gpkg")
            self._create_minimal_pretest_database(db_path)

            large_count = dataloader.QUICK_PRETEST_INDEX_ONLY_LIMIT + 5
            subfolders = [
                f"WI{index:03d}_AUTOTEST"
                for index in range(large_count)
            ]
            subfolders.extend([".hidden", "__metadata"])

            response = dataloader.pretestImportCandidates(
                {
                    "request": "pretestimportcandidates",
                    "database": db_path,
                    "root": root,
                    "istabularonly": True,
                    "quickpretest": True,
                    "subfolders": subfolders,
                }
            )

            self.assertTrue(response["status"])
            self.assertEqual("indexed", response["quickpretestmode"])
            self.assertEqual(large_count, len(response["subfolders"]))
            self.assertTrue(
                all(
                    row["preteststatus"]
                    for row in response["subfolders"]
                )
            )

    def test_small_pretest_uses_detailed_mode(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            dataloader = self._get_dataloader()
            root = os.path.join(temp_dir, "root")
            os.makedirs(root, exist_ok=True)

            db_path = os.path.join(temp_dir, "portal.gpkg")
            self._create_minimal_pretest_database(
                db_path,
                ssurgo_version="2.0",
            )

            folder_name = "WI055"
            tabular_dir = os.path.join(root, folder_name, "tabular")
            os.makedirs(tabular_dir, exist_ok=True)

            with open(
                os.path.join(tabular_dir, "sacatlog.txt"),
                "w",
                encoding="utf-8",
            ) as handle:
                handle.write("WI055|Sample Area||2.0\n")

            with open(
                os.path.join(tabular_dir, "version.txt"),
                "w",
                encoding="utf-8",
            ) as handle:
                handle.write("2.0\n")

            response = dataloader.pretestImportCandidates(
                {
                    "request": "pretestimportcandidates",
                    "database": db_path,
                    "root": root,
                    "istabularonly": True,
                    "quickpretest": True,
                    "subfolders": [folder_name],
                }
            )

            self.assertTrue(response["status"])
            self.assertEqual("detailed", response["quickpretestmode"])
            self.assertEqual(1, len(response["subfolders"]))
            self.assertTrue(response["subfolders"][0]["preteststatus"])

    def test_dispatch_summarizes_large_subfolder_logs(self):
        from dlcore.dispatch import Dispatch

        subfolders = [f"WI{index:03d}" for index in range(250)]
        request = {
            "request": "pretestimportcandidates",
            "database": "C:/tmp/fake.gpkg",
            "root": "C:/tmp",
            "istabularonly": True,
            "subfolders": subfolders,
        }

        captured_info_logs = []

        def capture_info(message):
            captured_info_logs.append(str(message))

        with mock.patch(
            "dlcore.dispatch.config.get",
            return_value="UnitTest",
        ), mock.patch(
            "dlcore.dispatch.UseCase5.pretestImportCandidates",
            return_value={
                "status": True,
                "allpassed": True,
                "message": "",
                "errormessage": "",
                "subfolders": [],
            },
        ), mock.patch(
            "dlcore.dispatch.tlogger.info",
            side_effect=capture_info,
        ), mock.patch("dlcore.dispatch.tlogger.error"):
            response = Dispatch.dispatch(request)

        self.assertTrue(response["status"])
        self.assertEqual(250, len(request["subfolders"]))
        self.assertIsInstance(request["subfolders"], list)

        json_logs = [
            line
            for line in captured_info_logs
            if line.strip().startswith("{")
        ]
        self.assertTrue(json_logs)
        logged_request = json.loads(json_logs[0])

        self.assertIn("subfolders", logged_request)
        self.assertIsInstance(logged_request["subfolders"], dict)
        self.assertEqual(250, logged_request["subfolders"]["count"])
        self.assertEqual(25, len(logged_request["subfolders"]["sample"]))


if __name__ == "__main__":
    unittest.main()
