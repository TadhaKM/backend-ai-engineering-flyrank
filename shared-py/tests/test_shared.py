"""Unit tests for `flyrank_shared`. No network, no real sleeping."""

from __future__ import annotations

import json
import logging
import random

import pytest
from flyrank_shared import (
    ConfigError,
    JsonFormatter,
    RateLimiter,
    RetryError,
    backoff_delay,
    env_bool,
    env_float,
    env_int,
    get_env,
    require_env,
    retry_with_backoff,
)


class TestEnv:
    def test_get_env_returns_default_when_unset(self) -> None:
        assert get_env("FLYRANK_DOES_NOT_EXIST", "fallback") == "fallback"

    def test_get_env_treats_blank_as_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("FLYRANK_BLANK", "   ")
        assert get_env("FLYRANK_BLANK", "fallback") == "fallback"

    def test_require_env_raises_with_the_variable_name(self) -> None:
        with pytest.raises(ConfigError, match="FLYRANK_MISSING"):
            require_env("FLYRANK_MISSING")

    def test_env_int_parses_and_rejects(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("FLYRANK_N", "42")
        assert env_int("FLYRANK_N", 0) == 42

        monkeypatch.setenv("FLYRANK_N", "not-a-number")
        with pytest.raises(ConfigError):
            env_int("FLYRANK_N", 0)

    def test_env_float_parses(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("FLYRANK_DELAY", "1.5")
        assert env_float("FLYRANK_DELAY", 0.0) == 1.5

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [("true", True), ("YES", True), ("1", True), ("off", False), ("no", False)],
    )
    def test_env_bool_accepts_common_spellings(
        self, monkeypatch: pytest.MonkeyPatch, raw: str, expected: bool
    ) -> None:
        monkeypatch.setenv("FLYRANK_FLAG", raw)
        assert env_bool("FLYRANK_FLAG", not expected) is expected

    def test_env_bool_rejects_nonsense(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("FLYRANK_FLAG", "maybe")
        with pytest.raises(ConfigError):
            env_bool("FLYRANK_FLAG", False)


class TestLogger:
    def test_formats_a_record_as_json_with_extras(self) -> None:
        record = logging.LogRecord(
            name="scraper",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="fetched %s",
            args=("page-1",),
            exc_info=None,
        )
        record.status = 200

        payload = json.loads(JsonFormatter().format(record))

        assert payload["level"] == "info"
        assert payload["name"] == "scraper"
        assert payload["msg"] == "fetched page-1"
        assert payload["status"] == 200
        assert "ts" in payload


class TestBackoff:
    def test_doubles_each_attempt(self) -> None:
        delays = [
            backoff_delay(n, base_delay=1.0, max_delay=60.0, jitter=0.0) for n in (1, 2, 3, 4)
        ]
        assert delays == [1.0, 2.0, 4.0, 8.0]

    def test_respects_the_ceiling(self) -> None:
        assert backoff_delay(10, base_delay=1.0, max_delay=5.0, jitter=0.0) == 5.0

    def test_jitter_only_ever_adds(self) -> None:
        rng = random.Random(7)
        for _ in range(50):
            delay = backoff_delay(1, base_delay=1.0, max_delay=60.0, jitter=0.5, rng=rng)
            assert 1.0 <= delay <= 1.5


class TestRetry:
    def test_returns_the_first_success_without_sleeping(self) -> None:
        slept: list[float] = []
        assert retry_with_backoff(lambda: "ok", sleep=slept.append) == "ok"
        assert slept == []

    def test_retries_until_it_succeeds(self) -> None:
        calls = {"n": 0}
        slept: list[float] = []

        def flaky() -> str:
            calls["n"] += 1
            if calls["n"] < 3:
                raise RuntimeError("boom")
            return "ok"

        result = retry_with_backoff(flaky, attempts=3, jitter=0.0, sleep=slept.append)

        assert result == "ok"
        assert calls["n"] == 3
        assert slept == [1.0, 2.0]

    def test_raises_retry_error_once_attempts_run_out(self) -> None:
        def always_fails() -> None:
            raise RuntimeError("boom")

        with pytest.raises(RetryError) as caught:
            retry_with_backoff(always_fails, attempts=2, jitter=0.0, sleep=lambda _: None)

        assert caught.value.attempts == 2
        assert isinstance(caught.value.cause, RuntimeError)

    def test_should_retry_false_reraises_immediately(self) -> None:
        calls = {"n": 0}

        def not_found() -> None:
            calls["n"] += 1
            raise FileNotFoundError("404")

        with pytest.raises(FileNotFoundError):
            retry_with_backoff(
                not_found,
                attempts=5,
                should_retry=lambda exc: not isinstance(exc, FileNotFoundError),
                sleep=lambda _: None,
            )

        assert calls["n"] == 1, "a non-retryable failure must not be retried"

    def test_delay_for_overrides_the_backoff(self) -> None:
        slept: list[float] = []
        calls = {"n": 0}

        def rate_limited() -> str:
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("429")
            return "ok"

        retry_with_backoff(
            rate_limited,
            attempts=2,
            jitter=0.0,
            delay_for=lambda _exc, _attempt: 30.0,
            sleep=slept.append,
        )

        assert slept == [30.0], "an explicit Retry-After must win over the standard backoff"


class TestRateLimiter:
    def test_first_call_does_not_wait(self) -> None:
        limiter = RateLimiter(1.5, clock=lambda: 0.0, sleep=_forbid_sleep)
        assert limiter.wait() == 0.0

    def test_waits_out_the_remainder_of_the_delay(self) -> None:
        now = {"t": 0.0}
        slept: list[float] = []

        limiter = RateLimiter(
            1.5,
            clock=lambda: now["t"],
            sleep=slept.append,
        )
        limiter.wait()  # t=0, free

        now["t"] = 0.5  # only half a second has passed
        limiter.wait()

        assert slept == [1.0], "should sleep exactly the remaining 1.0s"

    def test_does_not_wait_when_enough_time_already_passed(self) -> None:
        now = {"t": 0.0}
        slept: list[float] = []

        limiter = RateLimiter(1.5, clock=lambda: now["t"], sleep=slept.append)
        limiter.wait()

        now["t"] = 10.0  # slow parse; the delay has already elapsed
        assert limiter.wait() == 0.0
        assert slept == []

    def test_jitter_extends_the_wait_never_shortens_it(self) -> None:
        now = {"t": 0.0}
        slept: list[float] = []

        limiter = RateLimiter(
            1.0,
            jitter=0.5,
            clock=lambda: now["t"],
            sleep=slept.append,
            rng=random.Random(1),
        )
        limiter.wait()
        now["t"] = 0.0
        limiter.wait()

        assert 1.0 <= slept[0] <= 1.5

    def test_rejects_a_negative_delay(self) -> None:
        with pytest.raises(ValueError):
            RateLimiter(-1.0)


def _forbid_sleep(_seconds: float) -> None:
    raise AssertionError("should not have slept")
