"""CLI entry points for SSURGO portal helpers."""

from __future__ import annotations

import argparse
import logging
import sys

from . import __version__
from .downloader import DownloadError, download_file


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Download SSURGO artifacts with clear errors.")
    parser.add_argument("url", help="Source URL")
    parser.add_argument("destination", help="Output file path")
    return parser


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = build_parser()
    args = parser.parse_args()

    try:
        download_file(args.url, args.destination)
    except DownloadError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    return 0


def print_version() -> int:
    print(__version__)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
