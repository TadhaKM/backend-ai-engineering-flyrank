# Assignment 04 — A polite web scraper

A Python scraper for [books.toscrape.com](https://books.toscrape.com) that behaves
like a bot a site owner would actually allow: it reads `robots.txt` first, identifies
itself, rate limits itself, backs off when the server struggles, and caches every page
it fetches so a rerun costs the site nothing.

**Pipeline:** `fetch → parse → clean → structure → JSONL`

The deliverable is `data/books.jsonl` — a clean, deduped, consistently-typed record
per book. The next assignment turns it into a RAG corpus, so the schema is the point.

---

## Quick start

The scraper is Python, but it lives in the same npm workspace as everything else,
so `npm run check` at the repo root still covers it.

```bash
# From the repo root — once
python -m venv .venv
source .venv/Scripts/activate      # Windows (Git Bash);  .venv/bin/activate on macOS/Linux
npm run setup:py                   # installs flyrank_shared (editable) + this assignment's deps

# Then, from this folder
cd assignments/week-04/assignment-04
python -m scraper.main
```

That default run walks 5 listing pages, collects 100 books, and takes about three
minutes — nearly all of which is the scraper deliberately sitting still between
requests.

### The CLI

```bash
python -m scraper.main --max-pages 20 --delay 1.5 --output data/books.jsonl
```

| Flag          | Default            | What it does                                                        |
| ------------- | ------------------ | ------------------------------------------------------------------- |
| `--max-pages` | `5`                | Listing pages to walk before stopping.                              |
| `--max-books` | `100`              | Hard cap on records. Keeps a practice run a practice run.           |
| `--delay`     | `1.5`              | Seconds between requests. `robots.txt` can raise this, never lower. |
| `--jitter`    | `0.4`              | Random extra delay, `0..N` seconds, **added** on top.               |
| `--timeout`   | `10`               | Per-request timeout, seconds.                                       |
| `--workers`   | `1`                | Concurrency. Rejected above 3. One is the polite default.           |
| `--output`    | `data/books.jsonl` | Where the JSONL goes.                                               |
| `--csv`       | `data/books.csv`   | Where the flattened CSV goes.                                       |
| `--no-cache`  | off                | Ignore the disk cache and refetch everything. Be sure.              |
| `--log-level` | `info`             | `debug` shows every cache hit and sleep.                            |

Logs go to **stderr**, the run summary and data go to **stdout**/disk — so you can
pipe them apart:

```bash
python -m scraper.main 2> logs/run.log
```

### Tests

```bash
python -m pytest          # from this folder
npm run test:py           # from the repo root — this assignment + shared-py
```

No test touches the network. The parser tests run against saved HTML fixtures in
[`tests/fixtures/`](tests/fixtures/).

---

## How it behaves politely

Every one of these is enforced in [`scraper/fetch.py`](scraper/fetch.py), not left
to the caller's good intentions.

**1. `robots.txt` is read before anything else.**
The very first request of any run is `robots.txt`. It's parsed with
`urllib.robotparser`, and a disallowed URL is never requested at all.

> **What actually happens here:** `books.toscrape.com` **returns a 404 for
> `/robots.txt`** — it doesn't have one. By convention that means "no restrictions",
> and that is how the scraper treats it, but it _says so out loud_ in the run
> summary rather than quietly assuming permission. The distinction matters: a
> **missing** robots.txt (404) means allow-all, but an **unreadable** one (a 5xx, a
> timeout) means we don't know the rules — and in that case the scraper refuses to
> crawl at all rather than guess.

**2. A `Crawl-delay` can only slow us down.**
If `robots.txt` asks for a longer delay than the one requested, the longer one wins.
If it asks for a shorter one, we ignore it and stay slow. Politeness is a floor.

**3. Every request says who we are.**

```
User-Agent: TadScraperBot/1.0 (+contact: marepalt@tcd.ie; practice project)
```

A site owner reading their access log can tell what we are and how to reach us. An
anonymous bot is an unaccountable bot. Set `SCRAPER_CONTACT` to your own address.

**4. Rate limited to one request per 1.5s, plus jitter.**
The jitter is random and always **added**, never subtracted, so the configured delay
is a floor and not an average. This is a `RateLimiter` from
[`flyrank_shared`](../../../shared-py/), not a token bucket — a token bucket permits
bursts, which is the exact opposite of what a polite crawler wants.

**5. One worker.**
`--workers` exists and is capped at 3, but the default is 1 and there is no reason to
change it here. The whole catalogue is 1,000 books; at 1.5s each that is 25 minutes,
and nobody is waiting on this.

**6. Every request has a 10s timeout, and retries know the difference between failures.**

| Response              | What we do                                                                  |
| --------------------- | --------------------------------------------------------------------------- |
| `404` / `410`         | **Never retried.** The page isn't there; asking again won't change that.    |
| `429` / `503`         | Backoff **×3**, and an explicit `Retry-After` header overrides us entirely. |
| `500` / `502` / `504` | Standard exponential backoff: 1s, 2s, 4s… plus jitter.                      |
| Timeout / dropped     | Standard exponential backoff.                                               |

Retries are themselves rate limited — a retry is still a request.

**7. Fetched pages are cached to disk.**
`data/cache/<sha256-of-url>.html`, with a `.meta.json` sidecar so a directory of
hashes is still debuggable by a human. **Rerunning the scraper re-hits nothing it has
already seen.** During development this file was run dozens of times against a
handful of real pages — the cache is why that was fine.

---

## Output schema

`data/books.jsonl` — one JSON object per line. Every record has every key, always, in
this order:

| Field                | Type          | Notes                                                              |
| -------------------- | ------------- | ------------------------------------------------------------------ |
| `upc`                | `string`      | The dedupe key.                                                    |
| `title`              | `string`      | **Required** — a record without one is dropped.                    |
| `price`              | `float`       | **Required.** Currency symbol stripped. `51.77`, not `"£51.77"`.   |
| `currency`           | `string`      | ISO code (`GBP`), split out so `price` can be a bare number.       |
| `in_stock`           | `bool`        | Always a boolean.                                                  |
| `availability_count` | `int \| null` | The count when the page gives one, else `null`.                    |
| `star_rating`        | `int`         | `1`–`5`, converted from the word (`"Three"` → `3`). `0` = unrated. |
| `category`           | `string`      | From the breadcrumb.                                               |
| `description`        | `string`      | Full text, deduplicated — see the known issue below.               |
| `source_url`         | `string`      | **Required.** Absolute, fragment stripped.                         |
| `scraped_at`         | `string`      | ISO-8601, UTC.                                                     |

```json
{
  "upc": "a897fe39b1053632",
  "title": "A Light in the Attic",
  "price": 51.77,
  "currency": "GBP",
  "in_stock": true,
  "availability_count": 22,
  "star_rating": 3,
  "category": "Poetry",
  "description": "It's hard to imagine a world without A Light in the Attic…",
  "source_url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "scraped_at": "2026-07-14T21:58:03+00:00"
}
```

`data/books.csv` is the same data flattened, purely so a human can eyeball it in a
spreadsheet. **The JSONL is the deliverable; the CSV is a convenience.**

### One deliberate deviation from the brief

The brief asked for `availability` to be "an in-stock count if present, else a
boolean". A field that is sometimes an `int` and sometimes a `bool` is a landmine for
whatever reads the file next — and what reads it next is a RAG pipeline. So the
scraper emits **both**: `in_stock` is always a boolean, `availability_count` is the
number when there is one and `null` when there isn't. Same information, no type
surprises.

---

## Project structure

```text
scraper/
├── config.py   Every tunable in one place. CLI flag > env var > default.
├── models.py   The schema. `books.jsonl` is the deliverable, so this file is the contract.
├── fetch.py    The ONLY module that touches the network: robots, rate limit, retry, cache.
├── parse.py    HTML in, raw strings out. One function per page type. Converts nothing.
├── clean.py    Raw strings in, typed values out — or a drop, with a reason. Pure functions.
└── main.py     The CLI. Wires it together, dedupes, writes, and reports honestly.
data/
├── books.jsonl
├── books.csv
└── cache/      Fetched pages, keyed by URL hash. Git-ignored.
logs/
tests/
├── fixtures/   Saved copies of real pages
├── test_clean.py
└── test_parse.py
```

**Why `parse` and `clean` are separate.** It keeps the two failure modes
distinguishable. If the site redesigns, `parse.py` breaks. If the site's _data_ is
weird, `clean.py` breaks. Merge them and every bug becomes ambiguous. It also means
the messiest logic in the project — the cleaning — is made of pure functions, which
is why it can be tested exhaustively without a network connection.

**What comes from `shared-py`.** The `RateLimiter` and the `retry_with_backoff`
helper live in [`flyrank_shared`](../../../shared-py/), because the next Python
assignment will call an API and needs exactly the same two behaviours. The _crawling
policy_ — robots.txt, the cache, what counts as retryable — stays here, because only
a crawler has any use for it.

---

## Known limitations

- **Only `books.toscrape.com`.** The selectors in `parse.py` are specific to this
  site's markup. That's the assignment; a general-purpose scraper is a different job.
- **The description had to be de-duplicated by hand.** The site's "read more" widget
  puts the description in the page **twice** — a truncated preview immediately
  followed by the full text, both inside one `<p>`, with a trailing `...more`. A
  browser hides one copy with JavaScript; a scraper sees no JavaScript and reads
  both. `clean.clean_description` detects this and keeps only the full text. If the
  site changes that widget, this is the first thing that will break — the fixture at
  [`tests/fixtures/book_detail_readmore.html`](tests/fixtures/book_detail_readmore.html)
  exists to catch it.
- **`star_rating` of `0` is ambiguous** — it means "the page didn't give a rating",
  not "the book scored zero". The site only ever rates 1–5, so in practice it never
  appears, but a downstream consumer should treat `0` as "unrated".
- **No JavaScript.** The scraper reads server-rendered HTML. This site needs nothing
  more; a site that renders its content client-side would need a headless browser.
- **The cache never expires.** A page fetched a month ago is served from disk
  forever. Delete `data/cache/` (or pass `--no-cache`) to force a refetch. Fine for a
  static sandbox, wrong for a site whose prices actually move.
- **`--ignore-robots` exists and is hidden from `--help` on purpose.** It logs an
  error at you if you use it. Don't.

## Environment

Nothing here is secret and the scraper runs with no `.env` at all — every value has a
working default in `config.py`. See [`.env.example`](.env.example) for the full list;
the one worth changing is `SCRAPER_CONTACT`, which puts _your_ address in the
User-Agent.
