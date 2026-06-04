from __future__ import annotations

import logging

from ssurgo_portal.logging_config import configure_logging


def test_configure_logging_adds_handler_once() -> None:
    root = logging.getLogger()
    original_handlers = root.handlers[:]

    for handler in original_handlers:
        root.removeHandler(handler)

    try:
        configured = configure_logging()
        assert configured.handlers

        handler_count = len(configured.handlers)
        configure_logging(logging.DEBUG)

        assert len(configured.handlers) == handler_count
        assert configured.level == logging.DEBUG
    finally:
        for handler in root.handlers[:]:
            root.removeHandler(handler)
        for handler in original_handlers:
            root.addHandler(handler)
