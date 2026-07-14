"""CLI entrypoint. Orchestrates: robots -> crawl -> parse -> clean -> dedupe -> write.

    python -m scraper.main --max-pages 20 --delay 1.5 --output data/books.jsonl

Nothing in here parses HTML or speaks HTTP. It wires the other modules together
and reports honestly on what happened — including the records it threw away.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from flyrank_shared import AppError, get_logger

from . import config
from .clean import InvalidRecord, build_book, utc_now_iso
from .fetch import NotFound, PoliteFetcher, RobotsDisallowed, RobotsPolicy, load_robots
from .models import Book, DroppedRecord, FIELD_ORDER, csv_row
from .parse import parse_book_detail, parse_listing_page

logger = get_logger("scraper")


@dataclass
class RunStats:
    """Everything the end-of-run summary needs to be truthful."""

    started_at: float = field(default_factory=time.monotonic)
    listing_pages: int = 0
    detail_pages: int = 0
    books: list[Book] = field(default_factory=list)
    dropped: list[DroppedRecord] = field(default_factory=list)
    duplicates: int = 0

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self.started_at


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="scraper.main",
        description="A polite scraper for books.toscrape.com.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--max-pages", type=int, default=config.DEFAULT_MAX_PAGES,
                        help="Listing pages to walk before stopping.")
    parser.add_argument("--max-books", type=int, default=config.DEFAULT_MAX_BOOKS,
                        help="Hard cap on records. Keeps a practice run a practice run.")
    parser.add_argument("--delay", type=float, default=config.DEFAULT_DELAY,
                        help="Seconds between requests. robots.txt can raise this, never lower it.")
    parser.add_argument("--jitter", type=float, default=config.DEFAULT_JITTER,
                        help="Random extra delay, 0..N seconds, added on top.")
    parser.add_argument("--timeout", type=float, default=config.DEFAULT_TIMEOUT,
                        help="Per-request timeout in seconds.")
    parser.add_argument("--workers", type=int, default=config.DEFAULT_WORKERS,
                        help="Concurrent workers. Capped at 3 on purpose; 1 is the polite default.")
    parser.add_argument("--output", type=Path, default=config.DEFAULT_JSONL_PATH,
                        help="Where the JSONL goes.")
    parser.add_argument("--csv", dest="csv_path", type=Path, default=config.DEFAULT_CSV_PATH,
                        help="Where the flattened CSV goes.")
    parser.add_argument("--no-cache", action="store_true",
                        help="Ignore the on-disk cache and refetch everything. Be sure.")
    parser.add_argument("--ignore-robots", action="store_true",
                        help=argparse.SUPPRESS)  # deliberately undocumented; see README
    parser.add_argument("--log-level", default=None,
                        help="debug | info | warning | error")
    return parser


def to_config(args: argparse.Namespace) -> config.ScrapeConfig:
    if args.workers < 1 or args.workers > 3:
        raise SystemExit("--workers must be between 1 and 3. One is the polite default.")

    return config.ScrapeConfig(
        delay=args.delay,
        jitter=args.jitter,
        timeout=args.timeout,
        max_pages=args.max_pages,
        max_books=args.max_books,
        workers=args.workers,
        use_cache=not args.no_cache,
        obey_robots=not args.ignore_robots,
        jsonl_path=args.output,
        csv_path=args.csv_path,
    )


def crawl(fetcher: PoliteFetcher, cfg: config.ScrapeConfig, stats: RunStats) -> None:
    """Walk listing pages, then each book's detail page, until a cap is hit.

    Deduplication happens here, by UPC, as records are produced — so a book that
    appears on two listing pages is fetched once and stored once.
    """
    seen_upcs: set[str] = set()
    next_url: str | None = cfg.start_url

    while next_url and stats.listing_pages < cfg.max_pages and len(stats.books) < cfg.max_books:
        try:
            listing = fetcher.get(next_url)
        except (NotFound, RobotsDisallowed) as exc:
            logger.warning("stopping pagination", extra={"url": next_url, "err": str(exc)})
            break

        stats.listing_pages += 1
        page = parse_listing_page(listing.html, listing.url)
        logger.info(
            "listing page",
            extra={
                "page": stats.listing_pages,
                "url": listing.url,
                "books_found": len(page.book_urls),
                "cached": listing.from_cache,
            },
        )

        for book_url in page.book_urls:
            if len(stats.books) >= cfg.max_books:
                logger.info("reached --max-books, stopping", extra={"max_books": cfg.max_books})
                return

            book = scrape_book(fetcher, book_url, stats)
            if book is None:
                continue

            if book.upc and book.upc in seen_upcs:
                stats.duplicates += 1
                logger.debug("duplicate upc, skipped", extra={"upc": book.upc, "url": book_url})
                continue

            if book.upc:
                seen_upcs.add(book.upc)
            stats.books.append(book)

        next_url = page.next_page_url


def scrape_book(fetcher: PoliteFetcher, url: str, stats: RunStats) -> Book | None:
    """Fetch, parse, and clean one book. Returns None if it had to be dropped.

    A single bad book must never take the run down with it — the whole point of
    the drop-with-a-reason design is that the crawl keeps going and the summary
    tells you exactly what was lost and why.
    """
    try:
        page = fetcher.get(url)
    except RobotsDisallowed:
        stats.dropped.append(DroppedRecord(url, "robots.txt disallowed"))
        return None
    except NotFound:
        stats.dropped.append(DroppedRecord(url, "404 not found"))
        return None
    except AppError as exc:
        stats.dropped.append(DroppedRecord(url, f"fetch failed: {exc.code}"))
        return None

    stats.detail_pages += 1

    try:
        raw = parse_book_detail(page.html, page.url)
        return build_book(raw, scraped_at=utc_now_iso())
    except InvalidRecord as exc:
        stats.dropped.append(DroppedRecord(url, exc.reason))
        logger.warning("dropped record", extra={"url": url, "reason": exc.reason})
        return None


def write_jsonl(books: list[Book], path: Path) -> None:
    """One JSON object per line. The real deliverable."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for book in books:
            handle.write(json.dumps(book.to_dict(), ensure_ascii=False) + "\n")


def write_csv(books: list[Book], path: Path) -> None:
    """The same data, flattened, purely so a human can eyeball it in a spreadsheet."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(FIELD_ORDER))
        writer.writeheader()
        for book in books:
            writer.writerow(csv_row(book))


def print_summary(
    stats: RunStats,
    fetcher: PoliteFetcher,
    robots: RobotsPolicy,
    cfg: config.ScrapeConfig,
) -> None:
    """The run summary. Goes to stdout; the logs went to stderr.

    It reports what was dropped as prominently as what was kept. A scraper that
    only tells you about its successes is a scraper that is lying to you.
    """
    out = sys.stdout.write

    out("\n" + "=" * 68 + "\n")
    out("  RUN SUMMARY\n")
    out("=" * 68 + "\n\n")

    out("  Politeness\n")
    out(f"    User-Agent            {cfg.user_agent}\n")
    out(f"    Requested delay       {cfg.delay:.2f}s (+ up to {cfg.jitter:.2f}s jitter)\n")
    out(f"    Effective delay       {robots.effective_delay:.2f}s\n")
    out(f"    Concurrency           {cfg.workers} worker\n")
    out(f"    Timeout               {cfg.timeout:.0f}s per request, {cfg.max_attempts} attempts max\n")

    out("\n  robots.txt\n")
    out(f"    Source                {robots.url}\n")
    for note in robots.notes:
        out(f"    - {note}\n")
    if fetcher.blocked_by_robots:
        out(f"    URLs refused          {len(fetcher.blocked_by_robots)}\n")
    else:
        out("    URLs refused          0 (nothing we wanted was disallowed)\n")

    out("\n  Traffic\n")
    out(f"    Listing pages         {stats.listing_pages}\n")
    out(f"    Detail pages          {stats.detail_pages}\n")
    out(f"    Network requests      {fetcher.network_requests}\n")
    out(f"    Served from cache     {fetcher.cache_hits}  (cost the site nothing)\n")
    out(f"    Retries               {fetcher.retries}\n")

    out("\n  Records\n")
    out(f"    Extracted             {len(stats.books)}\n")
    out(f"    Duplicates skipped    {stats.duplicates}  (deduped by UPC)\n")
    out(f"    Dropped               {len(stats.dropped)}\n")
    for reason, count in Counter(d.reason for d in stats.dropped).most_common():
        out(f"      - {reason}: {count}\n")

    out("\n  Output\n")
    out(f"    JSONL                 {cfg.jsonl_path}\n")
    out(f"    CSV                   {cfg.csv_path}\n")

    out(f"\n  Total time              {stats.elapsed:.1f}s\n")
    out("=" * 68 + "\n")


def _force_utf8_output() -> None:
    """Windows terminals still default to cp1252, which cannot print "—" or "£".

    The files we write are always UTF-8 regardless; this is only so the *console*
    stops rendering them as "?".
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


def main(argv: list[str] | None = None) -> int:
    _force_utf8_output()
    args = build_parser().parse_args(argv)

    if args.log_level:
        get_logger("scraper", level=args.log_level)
        get_logger("scraper.fetch", level=args.log_level)

    cfg = to_config(args)
    config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not cfg.obey_robots:
        logger.error("--ignore-robots was passed. This is not a polite bot. Do not do this.")

    stats = RunStats()

    try:
        # Rule 1: the rules come first. Nothing else is requested until this returns.
        robots = load_robots(
            config.ROBOTS_URL,
            user_agent=cfg.user_agent,
            requested_delay=cfg.delay,
            timeout=cfg.timeout,
        )
    except AppError as exc:
        logger.error("could not establish the crawl rules", extra={"err": str(exc)})
        return 1

    fetcher = PoliteFetcher(cfg, robots)

    try:
        crawl(fetcher, cfg, stats)
    except KeyboardInterrupt:
        logger.warning("interrupted — writing what we have so far")

    write_jsonl(stats.books, cfg.jsonl_path)
    write_csv(stats.books, cfg.csv_path)
    print_summary(stats, fetcher, robots, cfg)

    return 0 if stats.books else 1


if __name__ == "__main__":
    raise SystemExit(main())
