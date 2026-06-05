# Changelog

All notable changes to this project should be documented in this file.

## [Unreleased]
- Add tracking for TODOs and repo-level work items with `TODO.md`
- Add initial release tracking with `CHANGELOG.md`

## [1.0.0.117] - 2026-06-05
- Improve first-run download speed with adaptive upload concurrency while preserving save-step stability in `version/RetryDownloadFailures-src/resources/ssa-downloader.mjs`.
- Benchmark the selected download profile (12 WI surveys, fresh folders) at ~17-18 seconds with 0 failures.
- Fix WI001 GDAL precheck/import reliability by removing shell dependence on `pip show gdal` and resolving `PROJ_LIB` from installed `osgeo/gdal` paths in `version/RetryDownloadFailures-src/dlcore/dataloader.py`.
- Harden packaging to exclude local virtual environments, temporary folders, and logs during PYZ creation in `version/RetryDownloadFailures-src/package_files.py`.
- Rebuild clean release artifacts with duplicate-free ZIP members: `version/SSURGO_Portal-1.0.0.117.pyz` and `version/SSURGO_Portal-1.0.0.117-click-to-run.zip`.
- Validate downloader regressions with `7/7` passing tests in `version/RetryDownloadFailures-src/tests/test_ssurgo_downloader.py`.

## [1.0.0.110] - 2026-06-04
- Bump SSURGO Portal application version to `1.0.0.110`.
- Add stronger ZIP extraction validation and cleanup for failed/corrupt downloads in `version/RetryDownloadFailures-src/dlcore/SSURGODownloader.py`.
- Add configurable bulk download retry controls (`downloadretryattempts`, `downloadretrydelayseconds`) with request schema support.
- Fix localhost non-pyz HTML component serving in `version/RetryDownloadFailures-src/dphost/webpage.py`.
- Fix frontend update prompt logic to only notify when a newer version is available in `version/RetryDownloadFailures-src/resources/ssurgo_portal_scripts.js`.
- Expand downloader regression tests in `version/RetryDownloadFailures-src/tests/test_ssurgo_downloader.py`.
- Add regression tests for corrupted ZIP download handling in `version/RetryDownloadFailures-src/tests`
- Improve `GetDownload` ZIP validation and cleanup in `version/RetryDownloadFailures-src/dlcore/SSURGODownloader.py`
- Improve `bulkDownload` failure reporting with explicit failed survey summary in `version/RetryDownloadFailures-src/dlcore/SSURGODownloader.py`

## [0.1.0] - 2026-06-04
- Initial explicit issue/task tracking with `TODO.md`
