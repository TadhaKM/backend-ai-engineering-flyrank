"""`flyrank_shared` — the public surface of the shared Python workspace.

Import from the package root in any Python assignment:

    from flyrank_shared import get_logger, env_float, RateLimiter, retry_with_backoff

This is the Python counterpart of the TypeScript `@flyrank/shared`. Same rule
applies: only genuinely reusable, assignment-agnostic building blocks live here.
Promote code into it once a *second* assignment needs it — not before.
"""

from .env import env_bool, env_float, env_int, get_env, require_env
from .errors import AppError, ConfigError
from .logger import JsonFormatter, get_logger
from .rate_limit import RateLimiter
from .retry import RetryError, backoff_delay, retry_with_backoff

__all__ = [
    "AppError",
    "ConfigError",
    "JsonFormatter",
    "RateLimiter",
    "RetryError",
    "backoff_delay",
    "env_bool",
    "env_float",
    "env_int",
    "get_env",
    "get_logger",
    "require_env",
    "retry_with_backoff",
]
