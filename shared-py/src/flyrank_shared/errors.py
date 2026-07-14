"""Error types shared by every Python assignment.

Mirrors `shared/src/errors.ts` on the TypeScript side so the two halves of the
workspace describe failure the same way.
"""

from __future__ import annotations


class AppError(Exception):
    """A failure the application understands and can report cleanly.

    `code` is a short, stable, machine-readable string (``"HTTP_TIMEOUT"``),
    while the message is the human-readable explanation.
    """

    def __init__(self, message: str, *, code: str = "APP_ERROR") -> None:
        super().__init__(message)
        self.code = code

    def __str__(self) -> str:
        return f"[{self.code}] {super().__str__()}"


class ConfigError(AppError):
    """The program is misconfigured — a missing or unparseable setting."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="CONFIG_ERROR")
