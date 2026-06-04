from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
import zipfile


@dataclass(frozen=True)
class ExtractionResult:
    success: bool
    archive_path: Path
    destination_dir: Path
    attempts: int
    user_message: str
    extracted_files: int = 0
    error: str | None = None


def _record_failure(record_path: Path, *, archive_path: Path, destination_dir: Path, error: str, attempts: int) -> None:
    record_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "archive_path": str(archive_path),
        "destination_dir": str(destination_dir),
        "error": error,
        "attempts": attempts,
    }
    with record_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")


def extract_ssurgo_archive(
    archive_path: str | Path,
    destination_dir: str | Path,
    *,
    max_retries: int = 0,
    failure_record_path: str | Path | None = None,
    logger: logging.Logger | None = None,
) -> ExtractionResult:
    """Extract a SSURGO archive and return explicit success/failure details."""
    log = logger or logging.getLogger(__name__)
    archive = Path(archive_path)
    destination = Path(destination_dir)

    if max_retries < 0:
        raise ValueError("max_retries must be >= 0")

    last_error: str | None = None
    for attempt in range(1, max_retries + 2):
        try:
            with zipfile.ZipFile(archive, "r") as zipped:
                bad_member = zipped.testzip()
                if bad_member is not None:
                    raise zipfile.BadZipFile(f"Integrity check failed for member: {bad_member}")
                zipped.extractall(destination)
                extracted = len(zipped.namelist())

            return ExtractionResult(
                success=True,
                archive_path=archive,
                destination_dir=destination,
                attempts=attempt,
                extracted_files=extracted,
                user_message=f"Successfully extracted {archive.name} to {destination}",
            )
        except (FileNotFoundError, zipfile.BadZipFile, OSError, RuntimeError) as exc:
            last_error = str(exc)
            log.error(
                "SSURGO archive extraction failed (attempt %s/%s) archive=%s destination=%s error=%s",
                attempt,
                max_retries + 1,
                archive,
                destination,
                last_error,
            )

    assert last_error is not None
    if failure_record_path is not None:
        _record_failure(
            Path(failure_record_path),
            archive_path=archive,
            destination_dir=destination,
            error=last_error,
            attempts=max_retries + 1,
        )

    return ExtractionResult(
        success=False,
        archive_path=archive,
        destination_dir=destination,
        attempts=max_retries + 1,
        error=last_error,
        user_message=(
            f"Failed to extract {archive.name}. The downloaded archive may be incomplete or corrupt. "
            "Please retry the download. If this continues, delete the archive and re-download that SSURGO dataset."
        ),
    )
