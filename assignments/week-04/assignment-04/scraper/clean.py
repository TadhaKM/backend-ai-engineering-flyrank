"""Turn the raw strings `parse.py` scraped into typed, normalised values.

Every function here is pure: string in, value out, no network, no clock, no files.
That is what makes them the easiest part of the project to test, and it is why the
test suite can cover the messiest logic in the codebase without touching the site.

The rule this module enforces: **a record is either clean or it is dropped.** There
is no half-parsed book. If a required field cannot be produced, `build_book` raises
`InvalidRecord` with a reason, and the caller records that reason in the summary.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit, urlunsplit

from flyrank_shared import AppError

from .models import Book, RawBook

WORD_TO_RATING: dict[str, int] = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
}

# "£51.77" -> 51.77 ; also survives "Â£51.77" (the mojibake you get when a UTF-8
# page is decoded as Latin-1) because we look for the number, not the symbol.
_PRICE_NUMBER = re.compile(r"(\d+(?:[.,]\d+)?)")
_CURRENCY_SYMBOL = re.compile(r"[£$€¥]")
_AVAILABILITY_COUNT = re.compile(r"(\d+)\s+available", re.IGNORECASE)

# The "read more" widget's trailing marker, e.g. "...a fatalistic melancholy. ...more"
_READ_MORE = re.compile(r"\s*\.\.\.\s*more\s*$", re.IGNORECASE)

# How much of the description to use as a fingerprint when looking for the
# duplicated preview. Long enough that no real book repeats it by accident.
_ANCHOR_LEN = 40


class InvalidRecord(AppError):
    """A record is missing something it cannot do without. Drop it, don't guess."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason, code="INVALID_RECORD")
        self.reason = reason


def normalize_text(value: str | None) -> str:
    """Collapse whitespace and normalise unicode. The workhorse of this module.

    Scraped HTML text is full of non-breaking spaces, zero-width characters, and
    ragged newlines from the source indentation. NFKC folds the lookalike unicode
    forms into their plain equivalents so that two strings that *look* identical
    actually compare equal — which matters a lot once this text becomes a RAG
    corpus and gets embedded, chunked, and deduplicated.
    """
    if value is None:
        return ""

    text = unicodedata.normalize("NFKC", value)
    text = text.replace(" ", " ")  # belt-and-braces; NFKC already folds NBSP
    # Strip invisibles (zero-width space, soft hyphen, control codes) but keep real
    # whitespace — otherwise "line one\nline two" collapses to "line oneline two".
    text = "".join(
        ch for ch in text if ch.isspace() or not unicodedata.category(ch).startswith("C")
    )
    return re.sub(r"\s+", " ", text).strip()


def parse_price(value: str | None) -> float:
    """'£51.77' -> 51.77. Raises `InvalidRecord` if there is no number in there."""
    text = normalize_text(value)
    if not text:
        raise InvalidRecord("missing price")

    match = _PRICE_NUMBER.search(text)
    if match is None:
        raise InvalidRecord(f"unparseable price: {text!r}")

    number = match.group(1).replace(",", ".")
    try:
        return round(float(number), 2)
    except ValueError as exc:  # pragma: no cover — the regex already guarantees a number
        raise InvalidRecord(f"unparseable price: {text!r}") from exc


def parse_currency(value: str | None, default: str = "GBP") -> str:
    """Pull the currency out of the price string so `price` can be a bare float."""
    text = normalize_text(value)
    symbol = _CURRENCY_SYMBOL.search(text)
    if symbol is None:
        return default
    return {"£": "GBP", "$": "USD", "€": "EUR", "¥": "JPY"}[symbol.group(0)]


def parse_star_rating(value: str | None) -> int:
    """'Three' -> 3. The site encodes the rating as a CSS class word, not a number."""
    text = normalize_text(value).lower()
    if not text:
        raise InvalidRecord("missing star rating")

    # The class attribute arrives as "star-rating Three".
    for word in text.split():
        if word in WORD_TO_RATING:
            return WORD_TO_RATING[word]

    raise InvalidRecord(f"unknown star rating: {value!r}")


def parse_availability(value: str | None) -> tuple[bool, int | None]:
    """'In stock (22 available)' -> (True, 22). 'Out of stock' -> (False, None).

    The brief said "in-stock count if present, else boolean". A field that is
    sometimes an int and sometimes a bool is a landmine for whatever reads the
    JSONL next, so this returns *both*: `in_stock` is always a boolean, and
    `availability_count` is the number when the page gives one, else null.
    """
    text = normalize_text(value)
    if not text:
        return (False, None)

    match = _AVAILABILITY_COUNT.search(text)
    if match is not None:
        count = int(match.group(1))
        return (count > 0, count)

    return ("in stock" in text.lower(), None)


def clean_description(value: str | None) -> str:
    """Undo the site's "read more" widget, which puts the description in twice.

    The detail page ships *both* copies of the text inside one `<p>`:

        <p>Dans une France assez proche de la n  [truncated, cut mid-word]
           Dans une France assez proche de la nôtre, un homme…  [the full text]
           ...more</p>

    A browser only ever shows one — JavaScript hides the other. But
    `get_text()` sees no JavaScript, so it happily concatenates them, and the
    record ends up with the opening ~380 characters duplicated and a stray
    "...more" glued on the end.

    Left alone this is exactly the kind of defect that survives all the way into
    a RAG corpus and quietly degrades it: the duplicated passage gets embedded
    twice, chunk boundaries land in the wrong places, and retrieval starts
    returning the same paragraph as two different "sources".

    The fix reads the structure rather than a character count: the preview is a
    prefix-truncation of the full text, so the full text begins at the *second*
    occurrence of the description's opening characters.
    """
    text = _READ_MORE.sub("", normalize_text(value))
    if len(text) <= _ANCHOR_LEN:
        return text

    anchor = text[:_ANCHOR_LEN]
    second = text.find(anchor, 1)
    if second == -1:
        return text  # not duplicated — most short descriptions aren't

    # The preview is a truncation, so the real text must be the longer half.
    # If it isn't, this isn't the pattern we think it is — leave the text alone.
    if len(text) - second < second:
        return text

    return text[second:].strip()


def absolute_url(base: str, href: str | None) -> str:
    """Resolve a relative href against the page it was found on, and tidy it.

    Catalogue pages link to books with paths like `../../../a-book_1/index.html`.
    Left alone, those turn into duplicate-looking URLs; resolved and normalised,
    the same book always produces the same string.
    """
    if not href:
        raise InvalidRecord("missing url")

    resolved = urljoin(base, href.strip())
    parts = urlsplit(resolved)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise InvalidRecord(f"not an http(s) url: {resolved!r}")

    # Drop the fragment — `#reviews` is the same page as no fragment at all.
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))


def utc_now_iso() -> str:
    """An ISO-8601 timestamp in UTC. One timezone, always, everywhere."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build_book(raw: RawBook, *, scraped_at: str | None = None) -> Book:
    """Validate and convert a `RawBook` into a `Book`, or raise `InvalidRecord`.

    Required: title, price, source_url (per the brief). Everything else degrades
    to a sensible empty value rather than killing an otherwise good record —
    a book with no description is still a book.
    """
    source_url = absolute_url(raw.source_url, raw.source_url)

    title = normalize_text(raw.title)
    if not title:
        raise InvalidRecord("missing title")

    price = parse_price(raw.price)  # raises on missing/unparseable
    currency = parse_currency(raw.price)

    try:
        star_rating = parse_star_rating(raw.star_rating)
    except InvalidRecord:
        star_rating = 0  # "unrated", not "invalid" — don't throw the book away over it

    in_stock, availability_count = parse_availability(raw.availability)

    return Book(
        upc=normalize_text(raw.upc),
        title=title,
        price=price,
        currency=currency,
        in_stock=in_stock,
        availability_count=availability_count,
        star_rating=star_rating,
        category=normalize_text(raw.category),
        description=clean_description(raw.description),
        source_url=source_url,
        scraped_at=scraped_at or utc_now_iso(),
    )
