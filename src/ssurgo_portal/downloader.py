"""Download helpers."""

from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


class DownloadError(RuntimeError):
    """Raised when a download fails."""


def download_to_file(url: str, destination: str | Path, timeout: float = 30.0) -> Path:
    """Download a URL to a local file path."""
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)

    try:
        with urlopen(
            url, timeout=timeout
        ) as response:  # nosec B310: controlled by caller
            data = response.read()
    except URLError as exc:
        raise DownloadError(f"Download failed for {url}: {exc.reason}") from exc

    output.write_bytes(data)
    return output
