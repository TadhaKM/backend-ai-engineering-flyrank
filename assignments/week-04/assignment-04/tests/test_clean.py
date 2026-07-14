"""Unit tests for `clean.py`. Pure functions, so: no network, no files, no clock.

These are the tests that matter most. Cleaning is where scraped data is at its
ugliest, and it is the one layer whose bugs are silent — a wrong price is still a
number, and a mangled description still looks like text until something downstream
chokes on it.
"""

from __future__ import annotations

import pytest
from scraper.clean import (
    InvalidRecord,
    absolute_url,
    build_book,
    clean_description,
    normalize_text,
    parse_availability,
    parse_currency,
    parse_price,
    parse_star_rating,
)
from scraper.models import RawBook

BOOK_URL = "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html"


class TestNormalizeText:
    def test_collapses_ragged_whitespace(self) -> None:
        assert normalize_text("  In stock\n\n     (22 available)  ") == "In stock (22 available)"

    def test_joins_lines_with_a_space_not_nothing(self) -> None:
        # The bug this guards: stripping control characters before collapsing
        # whitespace turns "line one\nline two" into "line oneline two".
        assert normalize_text("line one\nline two") == "line one line two"

    def test_folds_non_breaking_spaces(self) -> None:
        assert normalize_text("In stock") == "In stock"

    def test_strips_zero_width_characters(self) -> None:
        # Invisible, but they break equality checks and pollute embeddings later.
        assert normalize_text("Poe​try") == "Poetry"

    def test_normalizes_unicode_lookalikes(self) -> None:
        # NFKC folds the fullwidth 'Ａ' into a plain 'A'.
        assert normalize_text("Ａ Light") == "A Light"

    def test_none_becomes_empty_string(self) -> None:
        assert normalize_text(None) == ""

    def test_whitespace_only_becomes_empty_string(self) -> None:
        assert normalize_text("   \n\t  ") == ""


class TestParsePrice:
    def test_strips_the_currency_symbol(self) -> None:
        assert parse_price("£51.77") == 51.77

    def test_survives_mojibake(self) -> None:
        # What you get when a UTF-8 page is decoded as Latin-1. The parser looks
        # for the number, not the symbol, so it comes out intact anyway.
        assert parse_price("Â£51.77") == 51.77

    def test_handles_comma_decimals(self) -> None:
        assert parse_price("€50,10") == 50.10

    def test_handles_a_whole_number(self) -> None:
        assert parse_price("£20") == 20.0

    def test_ignores_surrounding_whitespace(self) -> None:
        assert parse_price("\n  £13.99 \n") == 13.99

    def test_returns_a_float_not_a_string(self) -> None:
        assert isinstance(parse_price("£51.77"), float)

    @pytest.mark.parametrize("bad", [None, "", "   ", "free", "£"])
    def test_rejects_anything_without_a_number(self, bad: str | None) -> None:
        with pytest.raises(InvalidRecord):
            parse_price(bad)


class TestParseCurrency:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [("£51.77", "GBP"), ("$51.77", "USD"), ("€50,10", "EUR"), ("¥900", "JPY")],
    )
    def test_maps_the_symbol_to_a_code(self, raw: str, expected: str) -> None:
        assert parse_currency(raw) == expected

    def test_falls_back_to_the_default_when_there_is_no_symbol(self) -> None:
        assert parse_currency("51.77") == "GBP"


class TestParseStarRating:
    @pytest.mark.parametrize(
        ("word", "expected"),
        [("One", 1), ("Two", 2), ("Three", 3), ("Four", 4), ("Five", 5), ("Zero", 0)],
    )
    def test_converts_the_word_to_an_int(self, word: str, expected: int) -> None:
        assert parse_star_rating(word) == expected

    def test_finds_the_word_inside_the_css_class_attribute(self) -> None:
        # This is how it actually arrives — the rating is never plain text.
        assert parse_star_rating("star-rating Three") == 3

    def test_is_case_insensitive(self) -> None:
        assert parse_star_rating("FIVE") == 5

    def test_returns_an_int_not_a_string(self) -> None:
        assert isinstance(parse_star_rating("Three"), int)

    @pytest.mark.parametrize("bad", [None, "", "star-rating", "Eleven"])
    def test_rejects_an_unknown_rating(self, bad: str | None) -> None:
        with pytest.raises(InvalidRecord):
            parse_star_rating(bad)


class TestParseAvailability:
    def test_extracts_the_count_when_the_page_gives_one(self) -> None:
        assert parse_availability("In stock (22 available)") == (True, 22)

    def test_survives_the_ragged_real_world_formatting(self) -> None:
        assert parse_availability("\n  In stock\n    (3 available)\n  ") == (True, 3)

    def test_falls_back_to_a_boolean_when_there_is_no_count(self) -> None:
        assert parse_availability("In stock") == (True, None)

    def test_out_of_stock(self) -> None:
        assert parse_availability("Out of stock") == (False, None)

    def test_zero_available_is_not_in_stock(self) -> None:
        assert parse_availability("In stock (0 available)") == (False, 0)

    def test_missing_availability_is_not_in_stock(self) -> None:
        assert parse_availability(None) == (False, None)


class TestCleanDescription:
    """The site's 'read more' widget puts the description in the page twice."""

    # The real shape: a preview truncated mid-word ("...revolution, s"), then the
    # full text, then the widget's marker. A browser hides one copy; we can't.
    DOUBLED = (
        "A quiet man takes a university post in a France not unlike our own, and finds s "
        "A quiet man takes a university post in a France not unlike our own, and finds "
        "the political system collapsing around him. ...more"
    )

    def test_keeps_only_the_full_text_not_the_preview(self) -> None:
        cleaned = clean_description(self.DOUBLED)

        assert cleaned == (
            "A quiet man takes a university post in a France not unlike our own, and finds "
            "the political system collapsing around him."
        )

    def test_the_opening_sentence_appears_exactly_once(self) -> None:
        cleaned = clean_description(self.DOUBLED)
        assert cleaned.count("A quiet man takes a university post") == 1

    def test_strips_the_read_more_marker(self) -> None:
        assert not clean_description(self.DOUBLED).endswith("...more")
        assert "...more" not in clean_description(self.DOUBLED)

    def test_leaves_an_ordinary_description_alone(self) -> None:
        text = "A short and perfectly ordinary description that is never duplicated."
        assert clean_description(text) == text

    def test_leaves_a_very_short_description_alone(self) -> None:
        assert clean_description("Tiny.") == "Tiny."

    def test_missing_description_is_empty_string(self) -> None:
        assert clean_description(None) == ""

    def test_does_not_truncate_when_the_halves_are_not_preview_and_full(self) -> None:
        # A guard against over-eager matching: if the second half is SHORTER than
        # the first, this isn't the preview/full pattern and we must not cut.
        text = "The very same opening words appear again here. The very same opening words."
        assert clean_description(text) == text


class TestAbsoluteUrl:
    def test_resolves_a_relative_href(self) -> None:
        assert (
            absolute_url("https://books.toscrape.com/catalogue/page-1.html", "soumission_998/index.html")
            == "https://books.toscrape.com/catalogue/soumission_998/index.html"
        )

    def test_resolves_a_dot_dot_href(self) -> None:
        assert (
            absolute_url(BOOK_URL, "../category/books/poetry_23/index.html")
            == "https://books.toscrape.com/catalogue/category/books/poetry_23/index.html"
        )

    def test_leaves_an_absolute_url_alone(self) -> None:
        assert absolute_url("https://books.toscrape.com/", BOOK_URL) == BOOK_URL

    def test_drops_the_fragment_so_one_page_is_one_url(self) -> None:
        assert absolute_url(BOOK_URL, f"{BOOK_URL}#reviews") == BOOK_URL

    def test_rejects_a_missing_href(self) -> None:
        with pytest.raises(InvalidRecord):
            absolute_url(BOOK_URL, None)

    def test_rejects_a_non_http_scheme(self) -> None:
        with pytest.raises(InvalidRecord):
            absolute_url(BOOK_URL, "javascript:alert(1)")


def a_raw_book(**overrides: object) -> RawBook:
    defaults: dict[str, object] = {
        "title": "A Light in the Attic",
        "price": "£51.77",
        "availability": "In stock (22 available)",
        "star_rating": "star-rating Three",
        "category": "Poetry",
        "description": "  Poems  and\n  drawings.  ",
        "upc": "a897fe39b1053632",
        "source_url": BOOK_URL,
    }
    return RawBook(**{**defaults, **overrides})  # type: ignore[arg-type]


class TestBuildBook:
    def test_produces_a_fully_typed_record(self) -> None:
        book = build_book(a_raw_book(), scraped_at="2026-07-14T12:00:00+00:00")

        assert book.title == "A Light in the Attic"
        assert book.price == 51.77
        assert book.currency == "GBP"
        assert book.in_stock is True
        assert book.availability_count == 22
        assert book.star_rating == 3
        assert book.category == "Poetry"
        assert book.description == "Poems and drawings."
        assert book.upc == "a897fe39b1053632"
        assert book.source_url == BOOK_URL
        assert book.scraped_at == "2026-07-14T12:00:00+00:00"

    def test_serialises_with_a_stable_key_order(self) -> None:
        book = build_book(a_raw_book())
        assert list(book.to_dict()) == [
            "upc", "title", "price", "currency", "in_stock", "availability_count",
            "star_rating", "category", "description", "source_url", "scraped_at",
        ]

    @pytest.mark.parametrize(
        ("field", "reason"),
        [("title", "missing title"), ("price", "missing price")],
    )
    def test_drops_a_record_missing_a_required_field(self, field: str, reason: str) -> None:
        with pytest.raises(InvalidRecord) as caught:
            build_book(a_raw_book(**{field: None}))
        assert caught.value.reason == reason

    def test_drops_a_record_with_no_usable_url(self) -> None:
        with pytest.raises(InvalidRecord):
            build_book(a_raw_book(source_url="not-a-url"))

    def test_an_unrated_book_is_kept_not_dropped(self) -> None:
        # A missing rating is a gap in the data, not a broken record. Losing a
        # whole book over it would be worse than recording a 0.
        book = build_book(a_raw_book(star_rating=None))
        assert book.star_rating == 0
        assert book.title == "A Light in the Attic"

    def test_a_book_with_no_description_is_kept(self) -> None:
        book = build_book(a_raw_book(description=None))
        assert book.description == ""
        assert book.price == 51.77
