# Assignments

Work is organised into **weeks**. Each week folder holds the assignments done that
week, and every assignment is its **own self-contained folder** named
`assignment-NN` (zero-padded, so folders keep sorting past 10).

```text
assignments/
├── week-01/
│   └── assignment-01/   🟢  Minimal Express backend (two JSON endpoints)
├── week-02/             (empty)
├── week-03/             (empty)
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
   Every assignment carries its own README describing the goal, how to run it,
   and what was learned.

5. **Record it.**
   Add a row to the Progress table in the [root README](../README.md#progress).

## Anatomy of an assignment

```text
week-NN/
└── assignment-NN/
    ├── README.md         # Goal, setup, how to run, notes
    ├── package.json      # Own dependencies + scripts (dev/start/test/typecheck)
    ├── tsconfig.json     # Extends the repo-root tsconfig (../../../tsconfig.json)
    ├── .env.example      # Documented env vars (copy to .env — never commit .env)
    ├── src/              # Source code
    └── tests/            # Tests (Vitest)
```

Simple assignments may drop what they don't need — `assignment-01` is plain JS with
no env vars, so it has just `server.js`, `package.json`, and `.gitignore`.

## Rules recap

- ❌ Never overwrite or rename a finished assignment.
- ❌ Never import across assignment folders.
- ✅ Reuse only through `@flyrank/shared`.
- ✅ Keep every assignment independently runnable.
- ✅ Commit `.env.example`; never commit `.env`.

## Index

| #   | Week | Assignment              | Status | Folder                                            |
| --- | ---- | ----------------------- | ------ | ------------------------------------------------- |
| 01  | 1    | Minimal Express backend | 🟢     | [`week-01/assignment-01`](week-01/assignment-01/) |

Weeks 2–10 exist and are empty, ready to be filled.

_Legend: 🟢 done · 🟡 in progress · ⚪ scaffolded / not started_
