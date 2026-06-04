# SSURGO Portal

## Project overview and goals

SSURGO Portal is intended to provide a clear and maintainable entry point for working with USDA SSURGO-related workflows, documentation, and tooling.

Primary goals:
- make setup and onboarding straightforward
- keep project standards visible and consistent
- centralize operational guidance (automation, checks, logging, monitoring)
- provide a clear path for contribution and support

## Setup and installation

This repository is currently documentation-first.

1. Clone the repository:
   ```bash
   git clone https://github.com/JasonNemecek-USDA/ssurgo_portal.git
   cd ssurgo_portal
   ```
2. Review the docs index: [`docs/README.md`](docs/README.md)
3. Follow quick start guidance: [`docs/guides/QUICK_START.md`](docs/guides/QUICK_START.md)

## Usage

Use this repository as the source of truth for:
- project standards and contributor onboarding
- SSURGO portal documentation and guides
- operational expectations for automation, checks, and monitoring

Start here:
- docs index: [`docs/README.md`](docs/README.md)
- user guide: [`docs/guides/USER_GUIDE.md`](docs/guides/USER_GUIDE.md)
- bulk downloader guide: [`docs/tools/BULK_DOWNLOADER.md`](docs/tools/BULK_DOWNLOADER.md)

## Contributing

Please review:
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

## Versioning and releases

- This project follows semantic versioning (`MAJOR.MINOR.PATCH`) for tagged releases.
- Release notes are documented in [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md).
- Breaking changes are highlighted in each release entry.

## Automation, logs, checks, and monitoring

Operational documentation is maintained in [`docs/operations/README.md`](docs/operations/README.md), including standards for:
- automation and CI workflows
- validation checks and quality gates
- logging and audit expectations
- monitoring and incident-response notes

## Guides and document formats

- User guides: `docs/guides/` (Markdown: `*.md`)
- Quick start guides: `docs/guides/` (Markdown: `*.md`)
- Bulk downloader documentation: `docs/tools/` (Markdown: `*.md`)

## Bug reporting and support

- Open a GitHub issue in this repository with reproduction steps and expected behavior.
- For contribution process questions, start with [`CONTRIBUTING.md`](CONTRIBUTING.md).
- For conduct concerns, follow [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).