"""Logging helpers for ssurgo_portal."""

from __future__ import annotations

import logging
from typing import Final

_DEFAULT_FORMAT: Final[str] = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def configure_logging(level: int = logging.INFO) -> logging.Logger:
    """Configure and return the root logger.

    This function is idempotent and safe to call repeatedly.
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    if not root_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(_DEFAULT_FORMAT))
        root_logger.addHandler(handler)

    return root_logger
