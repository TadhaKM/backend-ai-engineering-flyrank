"""A single-threaded rate limiter: never act twice within `delay` seconds.

Deliberately *not* a token bucket. A token bucket lets a burst through, which is
the opposite of what a polite crawler wants — the goal here is a steady, boring,
predictable request rate that a site owner would look at and shrug.

The jitter is added on top of the delay, never subtracted from it, so the
configured delay is a floor rather than an average.
"""

from __future__ import annotations

import random
import time
from collections.abc import Callable


class RateLimiter:
    """Sleeps in `wait()` until at least `delay` seconds have passed since the last call."""

    def __init__(
        self,
        delay: float,
        *,
        jitter: float = 0.0,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        rng: random.Random | None = None,
    ) -> None:
        if delay < 0:
            raise ValueError("delay must be >= 0")
        if jitter < 0:
            raise ValueError("jitter must be >= 0")

        self.delay = delay
        self.jitter = jitter
        self._clock = clock
        self._sleep = sleep
        self._rng = rng or random.Random()
        self._last: float | None = None
        self.total_waited = 0.0

    def wait(self) -> float:
        """Block until the next action is allowed. Returns how long it slept."""
        target = self.delay + (self._rng.uniform(0.0, self.jitter) if self.jitter else 0.0)

        if self._last is None:
            # First action is free — there is nothing to be polite *after* yet.
            self._last = self._clock()
            return 0.0

        elapsed = self._clock() - self._last
        remaining = target - elapsed
        if remaining > 0:
            self._sleep(remaining)
            self.total_waited += remaining
        else:
            remaining = 0.0

        self._last = self._clock()
        return remaining
