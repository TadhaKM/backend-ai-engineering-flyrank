# Assignments

Every internship assignment lives here as its **own self-contained folder**,
named `NN-slug` (two-digit number + short kebab-case slug).

```text
assignments/
├── 01-ai-core/      🟢  AI backend: Portkey gateway, Claude tool use, guardrails
├── 02-rag/          (future)
├── 03-agents/       (future)
├── 04-auth/         (future)
├── 05-streaming/    (future)
└── ...
```

## The workflow (read this before starting new work)

1. **Start a new folder — never edit an old one.**
   Run `npm run new:assignment` from the repo root, or copy
   [`../templates/assignment/`](../templates/assignment/) manually to
   `assignments/NN-slug/`. Numbers only go up; the previous highest + 1.

2. **Fill in the assignment.**
   Update its `README.md`, `package.json` `name`, and `.env.example`. Write code
   in `src/`, tests in `tests/`.

3. **Keep it independent.**
   An assignment must run on its own: `cd assignments/NN-slug && npm run dev`.
   Do **not** import from another assignment. If two assignments need the same
   code, promote it to [`../shared/`](../shared/) and import `@flyrank/shared`.

4. **Document it.**
   Every assignment carries its own README describing the goal, how to run it,
   and what was learned.

5. **Record it.**
   Add a row to the Progress table in the [root README](../README.md#progress).

## Anatomy of an assignment

```text
NN-slug/
├── README.md         # Goal, setup, how to run, notes
├── package.json      # Own dependencies + scripts (dev/start/test/typecheck)
├── tsconfig.json     # Extends the repo-root tsconfig
├── .env.example      # Documented env vars (copy to .env — never commit .env)
├── src/              # Source code
└── tests/            # Tests (Vitest)
```

## Rules recap

- ❌ Never overwrite or rename a finished assignment.
- ❌ Never import across assignment folders.
- ✅ Reuse only through `@flyrank/shared`.
- ✅ Keep every assignment independently runnable.
- ✅ Commit `.env.example`; never commit `.env`.

## Index

| #   | Assignment | Status | Folder                      |
| --- | ---------- | ------ | --------------------------- |
| 01  | AI Core    | 🟢     | [`01-ai-core`](01-ai-core/) |

_Legend: 🟢 done · 🟡 in progress · ⚪ scaffolded / not started_
