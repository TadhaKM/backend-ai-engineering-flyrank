# Assignments

Work is organised into **weeks**. Each week folder holds the assignments done that
week, and every assignment is its **own self-contained folder** named
`assignment-NN` (zero-padded, so folders keep sorting past 10).

```text
assignments/
├── week-01/
│   └── assignment-01/   🟢  Minimal Express backend (two JSON endpoints)
├── week-02/
│   ├── assignment-02/   🟢  Auth backend (register, login, JWT, protected route)
│   └── assignment-03/   🟢  Postgres in Docker (repository swap, volume, compose)
├── week-03/             (empty)
├── week-04/
│   └── assignment-04/   🟢  Polite web scraper (robots.txt, rate limit, retries, cache) — Python
├── week-05/             (empty)
│   ...
└── week-10/             (empty)
```

> **Numbering.** Assignment numbers are a **single global sequence across all
> weeks** — the next one is always (highest anywhere) + 1, so numbers are never
> reused. Weeks just group them.

> **Naming.** The default is `assignment-NN`. Only use a topical name when the
> assignment genuinely has one — then it's `NN-slug` (e.g. `02-rag`).

> Non-assignment work (practice builds, spikes) lives in [`../extras/`](../extras/),
> not here.

## The workflow (read this before starting new work)

1. **Start a new folder — never edit an old one.**
   From the repo root, say which week it belongs to:

   ```bash
   npm run new:assignment -- --week 2         # -> week-02/assignment-02
   npm run new:assignment -- --week 2 rag     # -> week-02/02-rag
   ```

   Or copy [`../templates/assignment/`](../templates/assignment/) manually into
   `assignments/week-NN/`. Numbers only go up; the previous highest + 1.

2. **Fill in the assignment.**
   Update its `README.md`, `package.json` `name`, and `.env.example`. Write code
   in `src/`, tests in `tests/`.

3. **Keep it independent.**
   An assignment must run on its own:
   `cd assignments/week-NN/assignment-NN && npm run dev`.
   Do **not** import from another assignment. If two assignments need the same
   code, promote it to [`../shared/`](../shared/) and import `@flyrank/shared`.

4. **Document it.**
   Every assignment carries a `README.md` (how to run it) AND an `EXPLANATION.md`
   (what was built, why, what went wrong) written for a beginner.

5. **Record it.**
   Add a row to the Progress table in the [root README](../README.md#progress).

## Anatomy of an assignment

```text
week-NN/
└── assignment-NN/
    ├── README.md         # Reference: how to run it, the API, the structure
    ├── EXPLANATION.md    # Walkthrough: what was built, why, what went wrong
    ├── package.json      # Own dependencies + scripts (dev/start/test/typecheck)
    ├── tsconfig.json     # Extends the repo-root tsconfig (../../../tsconfig.json)
    ├── .env.example      # Documented env vars (copy to .env — never commit .env)
    ├── src/              # Source code
    └── tests/            # Tests (Vitest)
```

**Every assignment gets both docs.** `README.md` is for someone _running_ the project.
`EXPLANATION.md` is a beginner-friendly account of the decisions, the trade-offs, the
bugs hit, and how it was verified. Keep them distinct — don't repeat the README.

Simple assignments may drop the code scaffolding they don't need — `assignment-01` is
plain JS with no env vars, so it has just `server.js`, `package.json`, and `.gitignore`.
The two docs are never optional.

## Rules recap

- ❌ Never overwrite or rename a finished assignment.
- ❌ Never import across assignment folders.
- ✅ Reuse only through `@flyrank/shared`.
- ✅ Keep every assignment independently runnable.
- ✅ Commit `.env.example`; never commit `.env`.

## Index

| #   | Week | Assignment              | Lang   | Status | Folder                                            |
| --- | ---- | ----------------------- | ------ | ------ | ------------------------------------------------- |
| 01  | 1    | Minimal Express backend | Node   | 🟢     | [`week-01/assignment-01`](week-01/assignment-01/) |
| 02  | 2    | Authentication backend  | Node   | 🟢     | [`week-02/assignment-02`](week-02/assignment-02/) |
| 03  | 2    | Postgres in Docker      | Node   | 🟢     | [`week-02/assignment-03`](week-02/assignment-03/) |
| 04  | 4    | Polite web scraper      | Python | 🟢     | [`week-04/assignment-04`](week-04/assignment-04/) |

Week 3 and weeks 5–10 exist and are empty, ready to be filled.

## Two languages, two shared packages

From assignment 04 the workspace is bilingual, so reuse has two homes. They are the
same idea twice; an assignment uses whichever one speaks its language.

| Assignments | Language | Import from                                      |
| ----------- | -------- | ------------------------------------------------ |
| 01–03       | Node/TS  | [`shared/`](../shared/) — `@flyrank/shared`      |
| 04+         | Python   | [`shared-py/`](../shared-py/) — `flyrank_shared` |

Both follow the same rule: **promote code once a second assignment needs it**, never in
anticipation. Python assignments still carry a small `package.json` so they stay inside
the npm workspace and `npm run check` keeps covering them.

_Legend: 🟢 done · 🟡 in progress · ⚪ scaffolded / not started_
