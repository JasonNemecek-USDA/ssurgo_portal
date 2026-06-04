"""ssurgo_portal package."""

from __future__ import annotations

import logging

from .logging_config import configure_logging

__all__ = ["configure_logging"]

__version__ = "0.1.0"

logging.getLogger(__name__).addHandler(logging.NullHandler())
