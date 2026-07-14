"""Structured logging.

Logs go to **stderr** as one JSON object per line, which keeps stdout clean for
actual program output (a JSONL corpus, a run summary) so the two can be piped
apart. Verbosity is controlled by the `LOG_LEVEL` environment variable.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from .env import get_env

_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", None, None).__dict__)


class JsonFormatter(logging.Formatter):
    """Render a log record as a single line of JSON."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "name": record.name,
            "msg": record.getMessage(),
        }
        # Anything passed via `logger.info("...", extra={...})` rides along as a field.
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def get_logger(name: str, *, level: str | None = None) -> logging.Logger:
    """Return a JSON logger. Calling this twice with one name is safe."""
    logger = logging.getLogger(name)
    resolved = (level or get_env("LOG_LEVEL", "info") or "info").upper()
    logger.setLevel(getattr(logging, resolved, logging.INFO))

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        logger.propagate = False

    return logger
