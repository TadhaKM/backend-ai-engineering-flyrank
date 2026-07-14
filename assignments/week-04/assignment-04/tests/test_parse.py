"""Tests for `parse.py`, driven by saved local HTML fixtures.

No network. The fixtures in `tests/fixtures/` are trimmed copies of real
books.toscrape.com pages, so these tests answer the question "does the parser
understand the actual markup?" without asking the site to prove it every time
someone runs `pytest`.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from scraper.clean import build_book
from scraper.parse import parse_book_detail, parse_listing_page

FIXTURES = Path(__file__).parent / "fixtures"

LISTING_URL = "https://books.toscrape.com/catalogue/page-1.html"
DETAIL_URL = "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"


@pytest.fixture(scope="module")
def listing_html() -> str:
    return (FIXTURES / "listing.html").read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def detail_html() -> str:
    return (FIXTURES / "book_detail.html").read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def readmore_html() -> str:
    return (FIXTURES / "book_detail_readmore.html").read_text(encoding="utf-8")


class TestParseListingPage:
    def test_finds_every_book_on_the_page(self, listing_html: str) -> None:
        page = parse_listing_page(listing_html, LISTING_URL)
        assert len(page.book_urls) == 3

    def test_resolves_relative_hrefs_to_absolute_urls(self, listing_html: str) -> None:
        page = parse_listing_page(listing_html, LISTING_URL)
        assert page.book_urls[0] == (
            "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"
        )
        assert all(url.startswith("https://") for url in page.book_urls)

    def test_finds_the_next_page_link(self, listing_html: str) -> None:
        page = parse_listing_page(listing_html, LISTING_URL)
        assert page.next_page_url == "https://books.toscrape.com/catalogue/page-2.html"

    def test_the_last_page_has_no_next_link(self, listing_html: str) -> None:
        # On the final page the site drops the <li class="next"> entirely. That
        # missing element is the crawler's only stop signal, so it must read as None.
        final_page = listing_html.replace(
            '<li class="next"><a href="page-2.html">next</a></li>', ""
        )
        page = parse_listing_page(final_page, LISTING_URL)

        assert page.next_page_url is None
        assert len(page.book_urls) == 3, "removing the pager must not lose the books"

    def test_an_empty_page_yields_nothing_rather_than_crashing(self) -> None:
        page = parse_listing_page("<html><body></body></html>", LISTING_URL)
        assert page.book_urls == []
        assert page.next_page_url is None


class TestParseBookDetail:
    def test_extracts_every_field(self, detail_html: str) -> None:
        raw = parse_book_detail(detail_html, DETAIL_URL)

        assert raw.title == "A Light in the Attic"
        assert raw.price == "£51.77"
        assert raw.upc == "a897fe39b1053632"
        assert raw.category == "Poetry"
        assert raw.source_url == DETAIL_URL

    def test_reads_the_star_rating_out_of_the_css_class(self, detail_html: str) -> None:
        # The page never says "three" in any text — the rating is only in the
        # class attribute, and the stars themselves are a background image.
        raw = parse_book_detail(detail_html, DETAIL_URL)
        assert raw.star_rating is not None
        assert "Three" in raw.star_rating

    def test_finds_the_description_that_sits_outside_its_heading(self, detail_html: str) -> None:
        # The trap: the <p> is a SIBLING of #product_description, not a child, so
        # the obvious `#product_description p` selector matches nothing at all.
        raw = parse_book_detail(detail_html, DETAIL_URL)
        assert raw.description is not None
        assert raw.description.startswith("It's hard to imagine a world without")

    def test_keeps_the_raw_availability_string_for_clean_py_to_handle(
        self, detail_html: str
    ) -> None:
        raw = parse_book_detail(detail_html, DETAIL_URL)
        assert raw.availability is not None
        assert "22 available" in raw.availability

    def test_missing_fields_come_back_as_none_not_exceptions(self) -> None:
        # parse.py reports absence; clean.py decides whether absence is fatal.
        raw = parse_book_detail("<html><body><h1>Orphan</h1></body></html>", DETAIL_URL)

        assert raw.title == "Orphan"
        assert raw.price is None
        assert raw.upc is None
        assert raw.description is None
        assert raw.star_rating is None


class TestParseThenClean:
    """The seam between the two modules — the pipeline as it actually runs."""

    def test_a_real_page_becomes_a_valid_record(self, detail_html: str) -> None:
        raw = parse_book_detail(detail_html, DETAIL_URL)
        book = build_book(raw, scraped_at="2026-07-14T12:00:00+00:00")

        assert book.title == "A Light in the Attic"
        assert book.price == 51.77
        assert book.currency == "GBP"
        assert book.star_rating == 3
        assert book.in_stock is True
        assert book.availability_count == 22
        assert book.category == "Poetry"
        assert book.upc == "a897fe39b1053632"

        # The fixture's description is indented across four lines in the HTML.
        # By the time it lands in a record it must be one clean line.
        assert "\n" not in book.description
        assert "  " not in book.description
        assert book.description.endswith("amuse the dowdiest of readers.")

    def test_the_read_more_page_does_not_duplicate_its_description(
        self, readmore_html: str
    ) -> None:
        # The whole pipeline on the page that exposed the bug: the site ships the
        # description twice, and exactly one copy may reach the record.
        raw = parse_book_detail(readmore_html, DETAIL_URL)
        assert raw.description is not None
        assert raw.description.count("Dans une France assez proche") == 2, (
            "the fixture must keep the site's duplication, or it tests nothing"
        )

        book = build_book(raw)

        assert book.description.count("Dans une France assez proche") == 1
        assert "...more" not in book.description
        assert book.description.startswith("Dans une France assez proche de la nôtre")
        assert book.description.endswith("fable politique et morale.")
        assert book.price == 50.10
        assert book.star_rating == 1
        assert book.availability_count == 20
        assert book.category == "Fiction"
