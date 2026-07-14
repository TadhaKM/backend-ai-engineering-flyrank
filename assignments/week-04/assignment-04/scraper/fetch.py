"""The HTTP layer — and the only file that is allowed to touch the network.

This is where "polite bot" is actually implemented. Everything below is a rule a
site owner would want a crawler to follow, and each one is enforced here rather
than left to the caller's good intentions:

  1. robots.txt is fetched and parsed *before* the first content request, and a
     disallowed URL is never requested at all.
  2. A Crawl-delay in robots.txt raises our delay. It can never lower it.
  3. Every request identifies the bot and a contact address in the User-Agent.
  4. Requests are rate limited to one every `delay` seconds, plus random jitter.
  5. Every request has a timeout. A hung socket is not a reason to hold a
     connection open on someone else's server forever.
  6. Failures retry with exponential backoff — harder on 429/503, never on 404.
  7. Pages are cached to disk. A rerun costs the site nothing.

The rate limiter and the backoff come from `flyrank_shared`; the crawling policy
is what lives here.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.robotparser
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import requests
from flyrank_shared import AppError, RateLimiter, RetryError, get_logger, retry_with_backoff

from . import config

logger = get_logger("scraper.fetch")


class RobotsDisallowed(AppError):
    """robots.txt says this URL is off limits. Not an error to retry — an answer."""

    def __init__(self, url: str) -> None:
        super().__init__(f"robots.txt disallows {url}", code="ROBOTS_DISALLOWED")
        self.url = url


class NotFound(AppError):
    """404/410. The page isn't there; asking again won't change that."""

    def __init__(self, url: str, status: int) -> None:
        super().__init__(f"{status} for {url}", code="NOT_FOUND")
        self.url = url
        self.status = status


class HttpError(AppError):
    """A retryable HTTP failure — a 5xx, a 429, a timeout, a dropped connection."""

    def __init__(self, message: str, *, status: int | None = None, retry_after: float | None = None):
        super().__init__(message, code="HTTP_ERROR")
        self.status = status
        self.retry_after = retry_after


@dataclass(frozen=True, slots=True)
class FetchResult:
    url: str
    html: str
    from_cache: bool


@dataclass
class RobotsPolicy:
    """What robots.txt told us, and what we decided to do about it."""

    url: str
    fetched: bool
    crawl_delay: float | None
    effective_delay: float
    notes: list[str]
    _parser: urllib.robotparser.RobotFileParser | None = None

    def can_fetch(self, user_agent: str, url: str) -> bool:
        if self._parser is None:
            return True  # no robots.txt to obey — see `notes` for why
        return self._parser.can_fetch(user_agent, url)


def load_robots(
    robots_url: str,
    *,
    user_agent: str,
    requested_delay: float,
    timeout: float,
    session: requests.Session | None = None,
) -> RobotsPolicy:
    """Fetch and parse robots.txt. This happens before anything else is requested.

    A missing robots.txt (404) conventionally means "no restrictions", and that is
    how we treat it — but we say so out loud in the run summary rather than
    quietly assuming permission. A robots.txt we *cannot read* (a 5xx, a timeout)
    is the opposite: we do not know the rules, so we do not crawl.
    """
    notes: list[str] = []
    http = session or requests.Session()

    try:
        response = http.get(
            robots_url,
            headers={"User-Agent": user_agent},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise HttpError(f"could not reach robots.txt at {robots_url}: {exc}") from exc

    if response.status_code in config.FATAL_STATUS_CODES:
        notes.append(
            f"no robots.txt at {robots_url} (HTTP {response.status_code}) — "
            "treating as 'allow all', which is the convention"
        )
        return RobotsPolicy(
            url=robots_url,
            fetched=False,
            crawl_delay=None,
            effective_delay=requested_delay,
            notes=notes,
            _parser=None,
        )

    if response.status_code >= 400:
        # We asked for the rules and the server refused to tell us. Do not guess.
        raise HttpError(
            f"robots.txt returned HTTP {response.status_code} — refusing to crawl "
            "without knowing the rules",
            status=response.status_code,
        )

    parser = urllib.robotparser.RobotFileParser()
    parser.set_url(robots_url)
    parser.parse(response.text.splitlines())

    crawl_delay: float | None = None
    raw_delay = parser.crawl_delay(user_agent)
    if raw_delay is not None:
        crawl_delay = float(raw_delay)

    effective_delay = requested_delay
    if crawl_delay is not None and crawl_delay > requested_delay:
        effective_delay = crawl_delay
        notes.append(
            f"robots.txt Crawl-delay is {crawl_delay}s, higher than the requested "
            f"{requested_delay}s — using {crawl_delay}s"
        )
    elif crawl_delay is not None:
        notes.append(f"robots.txt Crawl-delay is {crawl_delay}s; our {requested_delay}s is slower")
    else:
        notes.append("robots.txt sets no Crawl-delay")

    disallow_count = sum(
        1 for line in response.text.splitlines() if line.strip().lower().startswith("disallow:")
    )
    notes.append(f"robots.txt fetched and parsed ({disallow_count} Disallow rule(s))")

    return RobotsPolicy(
        url=robots_url,
        fetched=True,
        crawl_delay=crawl_delay,
        effective_delay=effective_delay,
        notes=notes,
        _parser=parser,
    )


def cache_key(url: str) -> str:
    """A stable filename for a URL. Hashed, because URLs are not valid filenames."""
    normalised = _canonical(url)
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()[:32]


def _canonical(url: str) -> str:
    """Ignore the fragment when caching — `#reviews` is the same page."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))


class PoliteFetcher:
    """A crawler that a site owner would look at and shrug."""

    def __init__(
        self,
        cfg: config.ScrapeConfig,
        robots: RobotsPolicy,
        *,
        session: requests.Session | None = None,
    ) -> None:
        self.cfg = cfg
        self.robots = robots
        self.session = session or requests.Session()
        self.session.headers.update({"User-Agent": cfg.user_agent})

        # The delay robots.txt insisted on, not necessarily the one we asked for.
        self.limiter = RateLimiter(robots.effective_delay, jitter=cfg.jitter)

        self.network_requests = 0
        self.cache_hits = 0
        self.retries = 0
        self.blocked_by_robots: list[str] = []

        if cfg.use_cache:
            cfg.cache_dir.mkdir(parents=True, exist_ok=True)

    # --- caching ------------------------------------------------------------

    def _cache_paths(self, url: str) -> tuple[Path, Path]:
        key = cache_key(url)
        return (
            self.cfg.cache_dir / f"{key}.html",
            self.cfg.cache_dir / f"{key}.meta.json",
        )

    def _read_cache(self, url: str) -> str | None:
        if not self.cfg.use_cache:
            return None
        body, _meta = self._cache_paths(url)
        if not body.exists():
            return None
        try:
            return body.read_text(encoding="utf-8")
        except OSError as exc:  # a corrupt cache is a cache miss, not a crash
            logger.warning("unreadable cache entry, refetching", extra={"url": url, "err": str(exc)})
            return None

    def _write_cache(self, url: str, html: str) -> None:
        if not self.cfg.use_cache:
            return
        body, meta = self._cache_paths(url)
        body.write_text(html, encoding="utf-8")
        # The sidecar exists so a directory of hashes is still debuggable by a human.
        meta.write_text(
            json.dumps(
                {"url": url, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "bytes": len(html)},
                indent=2,
            ),
            encoding="utf-8",
        )

    # --- fetching -----------------------------------------------------------

    def get(self, url: str) -> FetchResult:
        """Fetch a URL politely. Cache first, then robots, then the network."""
        # Cache before robots: we already have the bytes, and re-reading our own
        # disk costs the site nothing. (We still never *acquired* them illegally —
        # a disallowed URL is refused below and so never gets cached in the first place.)
        cached = self._read_cache(url)
        if cached is not None:
            self.cache_hits += 1
            logger.debug("cache hit", extra={"url": url})
            return FetchResult(url=url, html=cached, from_cache=True)

        if self.cfg.obey_robots and not self.robots.can_fetch(self.cfg.user_agent, url):
            self.blocked_by_robots.append(url)
            raise RobotsDisallowed(url)

        html = self._get_with_retries(url)
        self._write_cache(url, html)
        return FetchResult(url=url, html=html, from_cache=False)

    def _get_with_retries(self, url: str) -> str:
        def attempt() -> str:
            self.limiter.wait()  # inside the retry, so retries are rate limited too
            return self._get_once(url)

        try:
            return retry_with_backoff(
                attempt,
                attempts=self.cfg.max_attempts,
                base_delay=config.RETRY_BASE_DELAY,
                max_delay=config.RETRY_MAX_DELAY,
                jitter=config.RETRY_JITTER,
                should_retry=_is_retryable,
                delay_for=_delay_for,
                on_retry=self._log_retry,
            )
        except RetryError as exc:
            # Unwrap: the caller cares about the HTTP failure, not our retry machinery.
            raise HttpError(f"giving up on {url} after {exc.attempts} attempts: {exc.cause}") from exc

    def _get_once(self, url: str) -> str:
        self.network_requests += 1
        try:
            response = self.session.get(url, timeout=self.cfg.timeout)
        except requests.Timeout as exc:
            raise HttpError(f"timeout after {self.cfg.timeout}s: {url}") from exc
        except requests.RequestException as exc:
            raise HttpError(f"request failed: {url}: {exc}") from exc

        status = response.status_code

        if status in config.FATAL_STATUS_CODES:
            raise NotFound(url, status)

        if status >= 400:
            raise HttpError(
                f"HTTP {status} for {url}",
                status=status,
                retry_after=_retry_after_seconds(response),
            )

        # The site serves UTF-8 but does not always say so in the headers, and
        # requests then falls back to ISO-8859-1 — which is how "£51.77" becomes
        # "Â£51.77". Decode the bytes ourselves and stop guessing.
        response.encoding = response.apparent_encoding or "utf-8"
        logger.info("fetched", extra={"url": url, "status": status, "bytes": len(response.content)})
        return response.text

    def _log_retry(self, exc: BaseException, attempt: int, delay: float) -> None:
        self.retries += 1
        logger.warning(
            "retrying after failure",
            extra={"attempt": attempt, "sleep_s": round(delay, 2), "err": str(exc)},
        )


def _is_retryable(exc: BaseException) -> bool:
    """404 is an answer, not a failure. Don't badger the server for a page it doesn't have."""
    if isinstance(exc, (NotFound, RobotsDisallowed)):
        return False
    if isinstance(exc, HttpError):
        return exc.status is None or exc.status in config.RETRY_STATUS_CODES
    return False


def _delay_for(exc: BaseException, attempt: int) -> float | None:
    """Back off *harder* when the server is telling us it's struggling.

    A 429 or a 503 is the server explicitly asking for space. If it sent a
    `Retry-After`, that number wins over anything we would have chosen ourselves —
    it is the one party that actually knows when it will be ready.
    """
    if not isinstance(exc, HttpError) or exc.status is None:
        return None

    if exc.retry_after is not None:
        return exc.retry_after

    if exc.status in config.OVERLOAD_STATUS_CODES:
        base = config.RETRY_BASE_DELAY * (2 ** (attempt - 1))
        return min(base * config.OVERLOAD_BACKOFF_MULTIPLIER, config.RETRY_MAX_DELAY)

    return None


def _retry_after_seconds(response: Any) -> float | None:
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        return max(0.0, float(raw))  # the seconds form; the HTTP-date form is rare
    except (TypeError, ValueError):
        return None
