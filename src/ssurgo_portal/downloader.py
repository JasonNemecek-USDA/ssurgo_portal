"""Download helpers with explicit user-facing error messages."""

from __future__ import annotations

import logging
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import urlretrieve

logger = logging.getLogger(__name__)


class DownloadError(RuntimeError):
    """Raised when SSURGO download fails with user-safe context."""


def download_file(url: str, destination: str | Path) -> Path:
    """Download *url* to *destination* and return destination path.

    Raises:
        DownloadError: when URL is invalid, network request fails, or filesystem write fails.
    """

    if urlparse(url).scheme not in {"http", "https"}:
        raise DownloadError(f"Invalid download URL: {url!r}. URL must start with http:// or https://")

    destination_path = Path(destination)
    destination_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        logger.info("Starting SSURGO download: url=%s destination=%s", url, destination_path)
        urlretrieve(url, destination_path)
    except HTTPError as exc:
        logger.exception("SSURGO download HTTP failure")
        raise DownloadError(
            f"Download failed for {url}: server returned HTTP {exc.code}."
        ) from exc
    except URLError as exc:
        logger.exception("SSURGO download network failure")
        reason = exc.reason if exc.reason else "unknown network error"
        raise DownloadError(
            f"Download failed for {url}: unable to reach server ({reason})."
        ) from exc
    except OSError as exc:
        logger.exception("SSURGO download file write failure")
        raise DownloadError(
            f"Download failed while writing {destination_path}: {exc.strerror or str(exc)}."
        ) from exc

    logger.info("Completed SSURGO download: %s", destination_path)
    return destination_path
