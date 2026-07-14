"""The shape of the data. This file is the contract.

`books.jsonl` is not the end of the road — the next assignment turns it into a RAG
corpus. So the schema is the deliverable, and it is deliberately boring: flat, no
nested objects, no union-typed fields, every record carrying exactly the same keys
in exactly the same order. A downstream loader should never have to ask "is this
field a number today or a boolean?"
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, fields
from typing import Any

# The column order for the CSV, and the key order in the JSONL.
FIELD_ORDER: tuple[str, ...] = (
    "upc",
    "title",
    "price",
    "currency",
    "in_stock",
    "availability_count",
    "star_rating",
    "category",
    "description",
    "source_url",
    "scraped_at",
)


@dataclass(frozen=True, slots=True)
class Book:
    """One cleaned book record — one line of `books.jsonl`."""

    upc: str
    title: str
    price: float
    currency: str
    in_stock: bool
    availability_count: int | None
    star_rating: int
    category: str
    description: str
    source_url: str
    scraped_at: str

    def to_dict(self) -> dict[str, Any]:
        """Serialise with a stable key order."""
        raw = asdict(self)
        return {key: raw[key] for key in FIELD_ORDER}


@dataclass(frozen=True, slots=True)
class RawBook:
    """What `parse.py` pulls off the page: strings, exactly as the HTML had them.

    Nothing is converted here. Keeping the raw layer separate from the clean layer
    means a parsing bug and a cleaning bug can never be confused for each other.
    """

    title: str | None
    price: str | None
    availability: str | None
    star_rating: str | None
    category: str | None
    description: str | None
    upc: str | None
    source_url: str


@dataclass(frozen=True, slots=True)
class ListingPage:
    """What one catalogue page yields: links to books, and the link onwards."""

    book_urls: list[str]
    next_page_url: str | None


@dataclass(frozen=True, slots=True)
class DroppedRecord:
    """A record that did not make it into the output, and why."""

    source_url: str
    reason: str


def csv_row(book: Book) -> dict[str, Any]:
    """Flatten a book for CSV. Booleans and None need explicit spellings."""
    row = book.to_dict()
    row["in_stock"] = "true" if book.in_stock else "false"
    row["availability_count"] = "" if book.availability_count is None else book.availability_count
    # Newlines inside a CSV cell are legal but make the file miserable to eyeball,
    # which is the only reason this CSV exists.
    row["description"] = book.description.replace("\n", " ")
    return row


assert FIELD_ORDER == tuple(f.name for f in fields(Book)), (
    "FIELD_ORDER must list every Book field, in order — it drives both output formats"
)
