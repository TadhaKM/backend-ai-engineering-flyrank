"""Every tunable in one place.

Anything a person might reasonably want to change lives here rather than being
buried in the code. Each value can be overridden by an environment variable, and
the CLI can override that again — so precedence is: CLI flag > env var > default.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from flyrank_shared import env_float, env_int, get_env

# --- The target -------------------------------------------------------------

BASE_URL = "https://books.toscrape.com/"
START_URL = "https://books.toscrape.com/catalogue/page-1.html"
ROBOTS_URL = "https://books.toscrape.com/robots.txt"

# --- Identity ---------------------------------------------------------------
#
# A site owner reading their access log should be able to tell who we are and how
# to reach us. An anonymous bot is an unaccountable bot, and unaccountable bots
# are the ones that get IP-banned.

CONTACT = get_env("SCRAPER_CONTACT", "marepalt@tcd.ie") or "marepalt@tcd.ie"
USER_AGENT = f"TadScraperBot/1.0 (+contact: {CONTACT}; practice project)"

# --- Politeness -------------------------------------------------------------

DEFAULT_DELAY = env_float("SCRAPER_DELAY", 1.5)  # seconds between requests
DEFAULT_JITTER = env_float("SCRAPER_JITTER", 0.4)  # random extra, added not subtracted
DEFAULT_TIMEOUT = env_float("SCRAPER_TIMEOUT", 10.0)  # per-request, seconds
DEFAULT_WORKERS = 1  # one worker. See README before ever raising this.

# --- Retries ----------------------------------------------------------------

MAX_ATTEMPTS = env_int("SCRAPER_MAX_ATTEMPTS", 3)  # total tries, so 2 retries
RETRY_BASE_DELAY = env_float("SCRAPER_RETRY_BASE_DELAY", 1.0)
RETRY_MAX_DELAY = env_float("SCRAPER_RETRY_MAX_DELAY", 60.0)
RETRY_JITTER = env_float("SCRAPER_RETRY_JITTER", 0.25)

# When the server says "slow down" (429) or is unwell (5xx), a normal backoff is
# not enough of an apology. Multiply it.
OVERLOAD_BACKOFF_MULTIPLIER = env_float("SCRAPER_OVERLOAD_MULTIPLIER", 3.0)
RETRY_STATUS_CODES = frozenset({429, 500, 502, 503, 504})
OVERLOAD_STATUS_CODES = frozenset({429, 503})
FATAL_STATUS_CODES = frozenset({404, 410})  # never retried — the page is simply not there

# --- Scope ------------------------------------------------------------------
#
# A practice run should stay a practice run. These caps are what keep a default
# `python -m scraper.main` from walking all 1000 books on the site.

DEFAULT_MAX_PAGES = env_int("SCRAPER_MAX_PAGES", 5)
DEFAULT_MAX_BOOKS = env_int("SCRAPER_MAX_BOOKS", 100)

# --- Paths ------------------------------------------------------------------

ASSIGNMENT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ASSIGNMENT_ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
LOG_DIR = ASSIGNMENT_ROOT / "logs"
DEFAULT_JSONL_PATH = DATA_DIR / "books.jsonl"
DEFAULT_CSV_PATH = DATA_DIR / "books.csv"


@dataclass(frozen=True, slots=True)
class ScrapeConfig:
    """The settled configuration for one run, after CLI flags are applied."""

    start_url: str = START_URL
    user_agent: str = USER_AGENT
    delay: float = DEFAULT_DELAY
    jitter: float = DEFAULT_JITTER
    timeout: float = DEFAULT_TIMEOUT
    max_attempts: int = MAX_ATTEMPTS
    max_pages: int = DEFAULT_MAX_PAGES
    max_books: int = DEFAULT_MAX_BOOKS
    workers: int = DEFAULT_WORKERS
    cache_dir: Path = CACHE_DIR
    use_cache: bool = True
    obey_robots: bool = True
    jsonl_path: Path = DEFAULT_JSONL_PATH
    csv_path: Path = DEFAULT_CSV_PATH
