"""Typed environment-variable helpers.

Reading `os.environ` directly scatters `None` checks and `int(...)` casts through
the codebase, and a typo in a variable name fails silently. These helpers make a
bad configuration fail loudly, at startup, with the variable name in the message.
"""

from __future__ import annotations

import os

from .errors import ConfigError

_TRUE = frozenset({"1", "true", "yes", "y", "on"})
_FALSE = frozenset({"0", "false", "no", "n", "off"})


def get_env(name: str, default: str | None = None) -> str | None:
    """Return an environment variable, or `default` when it is unset or blank."""
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def require_env(name: str) -> str:
    """Return an environment variable, raising `ConfigError` when it is missing."""
    value = get_env(name)
    if value is None:
        raise ConfigError(f"Missing required environment variable: {name}")
    return value


def env_int(name: str, default: int) -> int:
    value = get_env(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {value!r}") from exc


def env_float(name: str, default: float) -> float:
    value = get_env(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number, got {value!r}") from exc


def env_bool(name: str, default: bool) -> bool:
    value = get_env(name)
    if value is None:
        return default
    lowered = value.lower()
    if lowered in _TRUE:
        return True
    if lowered in _FALSE:
        return False
    raise ConfigError(f"{name} must be a boolean (true/false), got {value!r}")
