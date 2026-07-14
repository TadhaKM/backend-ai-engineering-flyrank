"""A polite scraper for books.toscrape.com.

Pipeline:  fetch -> parse -> clean -> structure -> JSONL

    fetch.py    the only module that touches the network (robots, rate limit, retry, cache)
    parse.py    HTML in, raw strings out
    clean.py    raw strings in, typed values out — or a drop with a reason
    models.py   the schema; `books.jsonl` is the deliverable
    main.py     the CLI that wires it together and reports honestly
    config.py   every tunable, in one place
"""

__version__ = "1.0.0"
