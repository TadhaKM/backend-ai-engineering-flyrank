# Assignment 01 — AI Core

> **Status:** ⚪ Scaffolded — not yet implemented.
> This folder demonstrates the standard assignment shape. The actual assignment
> will be filled in when it begins.

## Goal

_To be defined when the assignment is handed out._ The intent of this first
assignment is to establish a foundational AI service that later assignments can
build on conceptually (not by direct dependency).

## Tech / dependencies

- TypeScript (ESM), run via `tsx`
- [`@flyrank/shared`](../../shared/) for logging, config, and common helpers
- Add assignment-specific dependencies to this folder's `package.json`

## Setup

```bash
# From the repo root, install once (covers all workspaces):
npm install

# Configure environment for this assignment:
cd assignments/01-ai-core
cp .env.example .env        # then fill in real values
```

## Run

```bash
# from assignments/01-ai-core
npm run dev        # watch mode
npm start          # one-shot run
npm test           # tests
npm run typecheck  # type-check
```

To load `.env` automatically, run with Node's flag, e.g.
`tsx --env-file=.env src/index.ts`, or use a loader of your choice.

## Structure

```text
01-ai-core/
├── README.md      # this file
├── package.json   # scripts + dependencies
├── tsconfig.json  # extends the repo-root tsconfig
├── .env.example   # documented env vars
├── src/
│   └── index.ts   # entrypoint (currently a scaffold stub)
└── tests/
    └── smoke.test.ts
```

## Notes / learnings

_Add design decisions, gotchas, and what you learned here as you build._
