# Standard assignment folder structure

Every assignment follows the same shape so the workspace stays predictable as it
grows. Copy [`assignment/`](assignment/) (or run `npm run new:assignment`) to get
this automatically.

```text
assignments/NN-slug/
├── README.md          # Goal, setup, how to run, notes  (required)
├── package.json       # Own scripts + dependencies       (required)
├── tsconfig.json      # Extends ../../tsconfig.json       (required)
├── .env.example       # Documented env vars              (required)
├── .env               # Real secrets — git-ignored, never committed
├── src/               # Source code                      (required)
│   └── index.ts       # Entrypoint
└── tests/             # Vitest tests                     (required)
    └── *.test.ts
```

## Optional additions (add only when needed)

```text
├── src/
│   ├── routes/        # HTTP handlers
│   ├── services/      # Business / AI logic
│   ├── lib/           # Assignment-local helpers (NOT shared across assignments)
│   └── types.ts       # Assignment-local types
├── docs/              # Deeper design notes for this assignment
├── data/              # Fixtures / sample inputs (keep large/binary data out of git)
└── scripts/           # One-off scripts for this assignment
```

## Rules

- **Required files must always be present** so every assignment is runnable and documented.
- **Local helpers stay local.** Only promote code to `../../shared/` when a
  _second_ assignment needs it — then import it as `@flyrank/shared`.
- **Never import from a sibling assignment.**
- **Two-digit, increasing numbers.** `01`, `02`, … `10`, `11`.
- **Kebab-case slugs.** `02-rag`, `03-agents`, `04-auth`.
