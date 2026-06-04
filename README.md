# SSURGO Portal

[![CI](https://github.com/JasonNemecek-USDA/ssurgo_portal/actions/workflows/ci.yml/badge.svg)](https://github.com/JasonNemecek-USDA/ssurgo_portal/actions/workflows/ci.yml)
[![CodeQL](https://github.com/JasonNemecek-USDA/ssurgo_portal/actions/workflows/codeql.yml/badge.svg)](https://github.com/JasonNemecek-USDA/ssurgo_portal/actions/workflows/codeql.yml)

Python tools and documentation scaffolding for SSURGO workflows.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
pytest
```

## Usage

```python
from ssurgo_portal.downloader import download_to_file

download_to_file("https://example.com/data.zip", "./data.zip")
```

## Supported Python versions

- 3.11
- 3.12
- 3.13

## References

- USDA SSURGO: https://www.nrcs.usda.gov/resources/data-and-reports/soil-survey-geographic-database-ssurgo
- Section 508 resources: https://www.section508.gov/

## Development

See `CONTRIBUTING.md`, `SECURITY.md`, and docs in `/docs`.
