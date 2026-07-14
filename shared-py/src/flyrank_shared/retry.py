"""Retry with exponential backoff and jitter.

Generic on purpose: it knows nothing about HTTP. The caller decides *which*
failures are worth retrying (`should_retry`) and may override the wait for a
specific failure (`delay_for` — e.g. honouring an HTTP `Retry-After` header).

Jitter matters. Without it, every client that failed at the same moment retries
at the same moment, and the server gets a second stampede on top of the first.
"""

from __future__ import annotations

import random
import time
from collections.abc import Callable
from typing import TypeVar

from .errors import AppError

T = TypeVar("T")

Sleeper = Callable[[float], None]


class RetryError(AppError):
    """Every attempt failed. The last underlying failure is on `.cause`."""

    def __init__(self, message: str, *, attempts: int, cause: BaseException) -> None:
        super().__init__(message, code="RETRY_EXHAUSTED")
        self.attempts = attempts
        self.cause = cause


def backoff_delay(
    attempt: int,
    *,
    base_delay: float,
    max_delay: float,
    jitter: float,
    rng: random.Random | None = None,
) -> float:
    """Delay before retry number `attempt` (1-based): base * 2^(attempt-1) + jitter."""
    raw = base_delay * (2 ** (attempt - 1))
    capped = min(raw, max_delay)
    spread = (rng or random).uniform(0.0, jitter) if jitter > 0 else 0.0
    return capped + spread


def retry_with_backoff(
    fn: Callable[[], T],
    *,
    attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: float = 0.25,
    should_retry: Callable[[BaseException], bool] = lambda _exc: True,
    delay_for: Callable[[BaseException, int], float | None] | None = None,
    on_retry: Callable[[BaseException, int, float], None] | None = None,
    sleep: Sleeper = time.sleep,
    rng: random.Random | None = None,
) -> T:
    """Call `fn`, retrying failures up to `attempts` times in total.

    Args:
        attempts: Total tries, including the first. `attempts=3` means at most 2 retries.
        should_retry: Return False to give up immediately and re-raise (e.g. a 404).
        delay_for: Return an override wait in seconds for this failure, or None to
            use the standard backoff. This is how a caller backs off harder on a 429.
        on_retry: Called before each sleep with (exception, attempt_number, delay).

    Raises:
        The original exception when `should_retry` rejects it, otherwise `RetryError`.
    """
    if attempts < 1:
        raise ValueError("attempts must be >= 1")

    last_exc: BaseException | None = None

    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — the predicate decides what is fatal
            last_exc = exc
            if not should_retry(exc):
                raise
            if attempt == attempts:
                break

            override = delay_for(exc, attempt) if delay_for else None
            delay = (
                override
                if override is not None
                else backoff_delay(
                    attempt,
                    base_delay=base_delay,
                    max_delay=max_delay,
                    jitter=jitter,
                    rng=rng,
                )
            )
            if on_retry:
                on_retry(exc, attempt, delay)
            sleep(delay)

    assert last_exc is not None
    raise RetryError(
        f"Gave up after {attempts} attempt(s): {last_exc}",
        attempts=attempts,
        cause=last_exc,
    ) from last_exc
