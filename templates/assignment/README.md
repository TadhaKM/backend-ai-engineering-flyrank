# Assignment __NUMBER__ — __TITLE__

> **Status:** ⚪ Not started

## Goal

_What is this assignment? What does "done" look like?_

## Approach

_How did you tackle it? Key design decisions._

## Tech / dependencies

- TypeScript (ESM), run via `tsx`
- [`@flyrank/shared`](../../../shared/) for logging, config, and common helpers
- _Add assignment-specific dependencies here_

## Setup

```bash
# from the repo root (installs all workspaces)
npm install

# configure this assignment
cd assignments/__WEEK__/__FOLDER__
cp .env.example .env      # then fill in real values
```

## Run

```bash
# from assignments/__WEEK__/__FOLDER__
npm run dev        # watch mode
npm start          # one-shot run
npm test           # tests
npm run typecheck  # type-check
```

## Structure

```text
__FOLDER__/
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   └── index.ts
└── tests/
    └── smoke.test.ts
```

## Notes / learnings

_Design decisions, gotchas, and what you learned._
