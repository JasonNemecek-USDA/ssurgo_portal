# SSURGO Portal Repository Setup

This repository now includes a production-ready Python baseline for SSURGO Portal tooling with:

- Versioned Python package (`ssurgo-portal`, current version `0.1.0`)
- CLI scripts (`ssurgo-download`, `ssurgo-version`)
- Clear user-facing download failure messages
- Unit tests for download behavior
- CI automation (lint + tests)
- Scheduled repository health reporting workflow
- Dependabot update automation
- Bug-report template that captures version and error details
- Apache-2.0 license

## Installation

```bash
pip install -e .
```

## CLI usage

```bash
ssurgo-version
ssurgo-download "https://example.com/file.zip" "./downloads/file.zip"
```

If download fails, the tool prints a human-readable error that explains why (invalid URL, HTTP status, network issue, or write issue).

## Development checks

```bash
pip install -e .
pip install ruff pytest
ruff check .
pytest -q
```

## Versioning

Repository version is declared in:

- `pyproject.toml` (`project.version`)
- `src/ssurgo_portal/__init__.py` (`__version__`)

For each release, update both values and create a git tag (for example `v0.1.1`).

## SSURGO references

- Main portal: https://www.nrcs.usda.gov/resources/data-and-reports/ssurgo-portal
- Quick Start Guide (CEC): https://www.nrcs.usda.gov/sites/default/files/2024-11/SSURGO-Portal-Quick-Start-Guide-CEC.pdf
- Quick Start Guide: https://www.nrcs.usda.gov/sites/default/files/2024-11/SSURGO-Portal-Quick-Start-Guide.pdf
- User Guide: https://www.nrcs.usda.gov/sites/default/files/2024-11/SSURGO-Portal-User-Guide.pdf
- Installation Guide: https://www.nrcs.usda.gov/sites/default/files/2023-10/SSURGO%20Portal%20Installation%20Guide_0.pdf
- Installation Guide (CEC): https://www.nrcs.usda.gov/sites/default/files/2024-08/SSURGO-Portal-Installation-Guide-CEC.pdf
- Bulk Downloader (ArcGIS Pro): https://www.nrcs.usda.gov/sites/default/files/2023-09/SSURGO-Bulk-Downloader-ArcGIS-Pro.zip
- Bulk Downloader (QGIS): https://www.nrcs.usda.gov/sites/default/files/2023-09/SSURGO-Bulk-Downloader-QGIS.zip
