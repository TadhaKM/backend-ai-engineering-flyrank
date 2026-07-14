# `flyrank_shared`

The **Python** counterpart of [`@flyrank/shared`](../shared/). Same job, same rules,
different language: reusable building blocks that more than one assignment needs.

The workspace has two shared packages because it has two languages. The Node
assignments (01–03) import `@flyrank/shared`; the Python assignments (04 onwards)
import `flyrank_shared`. Neither can import the other, so the split is real, not
cosmetic.

```python
from flyrank_shared import get_logger, env_float, RateLimiter, retry_with_backoff
```

## What's in it

| Module          | Exports                                                      | Why it's shared                                                                                 |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `errors.py`     | `AppError`, `ConfigError`                                    | One vocabulary for "this failed and we understand why".                                         |
| `env.py`        | `get_env`, `require_env`, `env_int`, `env_float`, `env_bool` | Misconfiguration fails loudly at startup, naming the variable — not silently at 3am.            |
| `logger.py`     | `get_logger`, `JsonFormatter`                                | JSON logs to **stderr**, so stdout stays clean for real output (a JSONL corpus, a run summary). |
| `retry.py`      | `retry_with_backoff`, `backoff_delay`, `RetryError`          | Exponential backoff + jitter. Knows nothing about HTTP — the caller decides what's retryable.   |
| `rate_limit.py` | `RateLimiter`                                                | "Never act twice within N seconds." The core of polite-bot behaviour.                           |

## What does NOT belong here

Anything that only makes sense for one assignment. Assignment 04's price parsing,
star-rating conversion, and robots.txt handling all stay in the scraper, because
only the scraper has books and only the scraper crawls. `RateLimiter` and
`retry_with_backoff` were promoted because the next Python assignment (a RAG
corpus built on this scraper's output) will hit an API and needs exactly the same
two behaviours.

> The rule, as in `shared/`: promote code once a **second** assignment needs it.
> Not in anticipation of one.

## Install (editable, from the repo root)

```bash
python -m venv .venv
source .venv/Scripts/activate     # Windows Git Bash;  .venv/bin/activate on macOS/Linux
pip install -e shared-py
```

Assignments install it for you — `pip install -r requirements.txt` inside
`assignments/week-04/assignment-04` pulls it in as an editable path dependency,
so edits here are picked up immediately with no reinstall.

## Commands

```bash
python -m pytest shared-py           # or: npm run test --workspace @flyrank/shared-py
```

## Design notes

- **No `Result` type.** `@flyrank/shared` has one because TypeScript's exceptions
  are untyped and invisible in a signature. Python has exceptions with real types
  and `raises` documentation, so a `Result` here would be TypeScript cosmetics
  rather than a Python idiom.
- **Everything is injectable.** `RateLimiter` and `retry_with_backoff` take their
  `clock`, `sleep`, and `rng` as arguments. That's what lets the tests verify the
  backoff schedule and the polite delay exactly, in milliseconds, with no real
  waiting and no flakiness.
- **No side effects on import.** Modules only export.
