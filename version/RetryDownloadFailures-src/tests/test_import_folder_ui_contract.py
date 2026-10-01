import os
import re
import unittest


class TestImportFolderUiContract(unittest.TestCase):
    @staticmethod
    def _repo_root() -> str:
        return os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

    def _read_resource(self, relative_path: str) -> str:
        file_path = os.path.join(self._repo_root(), relative_path)
        with open(file_path, 'r', encoding='utf-8') as handle:
            return handle.read()

    def test_loading_overlay_has_change_folder_action(self):
        html = self._read_resource('resources/ssurgo_portal_UI.html')

        self.assertIn('id="changeFolderDuringPretestBtn"', html)
        self.assertIn('Change folder location', html)
        self.assertIn(
            "onclick=\"initializeTreeView('importTreeViewTable', "
            "'pretestimportcandidates')\"",
            html,
        )

    def test_pretest_keeps_browse_enabled_and_queues_changes(self):
        script = self._read_resource('resources/ssurgo_portal_scripts.js')

        self.assertIn('let importPretestInFlight = false', script)
        self.assertIn('let pendingImportPretestPath = null', script)

        self.assertRegex(
            script,
            re.compile(
                (
                    r"if\(importPretestInFlight\)\s*\{"
                    r"[\s\S]*?pendingImportPretestPath\s*=\s*"
                    r"normalizedRequestedPath"
                    r"[\s\S]*?Queued folder change while pretest is running"
                ),
                re.MULTILINE,
            ),
        )

        self.assertRegex(
            script,
            re.compile(
                r"if\(element\.id == 'selectedFolderNameBrowseBtn' \|\| "
                r"element\.id == 'selectDatabaseBrowseBtn'\)\s*\{"
                r"\s*element\.disabled = false"
                r"[\s\S]*?return",
                re.MULTILINE,
            ),
        )


if __name__ == '__main__':
    unittest.main()
