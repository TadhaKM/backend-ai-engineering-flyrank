"""HTML in, raw strings out. One function per page type.

This module does exactly one job: find things in the markup. It does not convert,
validate, or normalise anything — every value it returns is the string the page
actually contained (or `None` if the page didn't contain it). `clean.py` owns the
conversion.

Splitting it this way means the two failure modes stay distinguishable. If the
site redesigns, `parse.py` breaks. If the site's *data* is weird, `clean.py`
breaks. Merging them would make every bug ambiguous.
"""

from __future__ import annotations

from bs4 import BeautifulSoup, Tag

from .clean import absolute_url
from .models import ListingPage, RawBook

PARSER = "lxml"


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, PARSER)


def _text_or_none(node: Tag | None) -> str | None:
    """A missing node and an empty node are both `None` — the caller decides if that's fatal."""
    if node is None:
        return None
    text = node.get_text(strip=True)
    return text or None


def parse_listing_page(html: str, page_url: str) -> ListingPage:
    """Pull every book link off a catalogue page, plus the link to the next page.

    Books on the listing are linked relatively (`the-book_1/index.html`), so each
    href is resolved against the page it was found on. The "next" link is the only
    thing that drives pagination — we never guess at `page-N.html` URLs, because
    guessing means requesting pages that may not exist, and 404s are noise in
    somebody's error log.
    """
    soup = _soup(html)

    book_urls: list[str] = []
    for pod in soup.select("article.product_pod"):
        anchor = pod.select_one("h3 > a[href]")
        if anchor is None:
            continue
        href = anchor.get("href")
        if isinstance(href, str):
            book_urls.append(absolute_url(page_url, href))

    next_page_url: str | None = None
    next_anchor = soup.select_one("li.next > a[href]")
    if next_anchor is not None:
        href = next_anchor.get("href")
        if isinstance(href, str):
            next_page_url = absolute_url(page_url, href)

    return ListingPage(book_urls=book_urls, next_page_url=next_page_url)


def parse_book_detail(html: str, page_url: str) -> RawBook:
    """Pull every field of interest off a single book's detail page."""
    soup = _soup(html)
    main = soup.select_one("div.product_main") or soup

    return RawBook(
        title=_text_or_none(main.select_one("h1")),
        price=_text_or_none(main.select_one("p.price_color")),
        availability=_text_or_none(main.select_one("p.availability")),
        star_rating=_star_rating_class(main),
        category=_category_from_breadcrumb(soup),
        description=_description(soup),
        upc=_product_table(soup).get("UPC"),
        source_url=page_url,
    )


def _star_rating_class(main: Tag) -> str | None:
    """The rating is a CSS class, not text: `<p class="star-rating Three">`.

    Nothing inside that element says "three" — the word is only in the class
    attribute, and the visible stars are a background image. Read the attribute.
    """
    node = main.select_one("p.star-rating")
    if node is None:
        return None

    classes = node.get("class")
    if not isinstance(classes, list):
        return None

    # Return the whole class list; clean.parse_star_rating finds the word in it.
    return " ".join(classes)


def _category_from_breadcrumb(soup: BeautifulSoup) -> str | None:
    """Breadcrumb is: Home > Books > <Category> > <This Book>.

    The category is the last *linked* crumb — the final crumb is the book itself
    and is not a link. Taking "the last <a>" is therefore stable even if the site
    adds or removes a level, which indexing `li:nth-child(3)` would not be.
    """
    crumbs = soup.select("ul.breadcrumb li a")
    if not crumbs:
        return None

    text = _text_or_none(crumbs[-1])
    if text in (None, "Home", "Books"):
        return None  # no real category level present
    return text


def _description(soup: BeautifulSoup) -> str | None:
    """The description is the <p> that *follows* `#product_description` — it is not inside it.

    `<div id="product_description"><h2>Product Description</h2></div><p>The text…</p>`

    So `#product_description p` matches nothing, which is the trap here.
    """
    heading = soup.select_one("#product_description")
    if heading is None:
        return None

    paragraph = heading.find_next_sibling("p")
    if isinstance(paragraph, Tag):
        return _text_or_none(paragraph)
    return None


def _product_table(soup: BeautifulSoup) -> dict[str, str]:
    """The 'Product Information' table, as a plain {header: value} dict."""
    table: dict[str, str] = {}
    for row in soup.select("table.table-striped tr"):
        header = row.find("th")
        value = row.find("td")
        if isinstance(header, Tag) and isinstance(value, Tag):
            key = header.get_text(strip=True)
            if key:
                table[key] = value.get_text(strip=True)
    return table
