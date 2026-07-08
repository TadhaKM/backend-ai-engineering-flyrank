# Getting started

## Prerequisites

- **Node.js ≥ 20** (the repo pins `20` in [`.nvmrc`](../.nvmrc); run `nvm use` if
  you use nvm).
- **npm** (ships with Node). This repo uses **npm workspaces** — no extra package
  manager needed.

## Install

From the repo root:

```bash
npm install
```

This installs the shared dev tooling and links every workspace
(`shared/` + each assignment) together. You only need to do this once, and again
whenever dependencies change.

## Everyday commands (from the repo root)

| Command                  | What it does                                      |
| ------------------------ | ------------------------------------------------- |
| `npm run check`          | Format check + lint + typecheck + tests (CI gate) |
| `npm run format`         | Auto-format the whole repo                        |
| `npm run lint`           | Lint every workspace                              |
| `npm run typecheck`      | Type-check every workspace                        |
| `npm test`               | Run all tests                                     |
| `npm run new:assignment` | Scaffold a new assignment                         |

## Working inside one assignment

Scope any command to a single workspace with `--workspace`:

```bash
npm run dev  --workspace assignments/week-01/assignment-01
npm test     --workspace assignments/week-01/assignment-01
```

…or just `cd` into it and use its local scripts:

```bash
cd assignments/week-01/assignment-01
cp .env.example .env      # then fill in your values
npm run dev
```

## Using shared code

Import the shared package from any assignment:

```ts
import { createLogger, requireEnv } from '@flyrank/shared';

const log = createLogger({ name: 'my-assignment' });
log.info('hello', { from: 'assignment' });
```

There is **no build step** — `tsx` and Vitest run TypeScript (including
`@flyrank/shared`) directly from source.

## Environment variables

- Copy each assignment's `.env.example` to `.env` and fill it in.
- `.env` is git-ignored; **never commit secrets**.
- To auto-load `.env` when running, use Node's flag: `tsx --env-file=.env src/index.ts`.

## Troubleshooting

- **`Cannot find module '@flyrank/shared'`** → run `npm install` at the repo root
  so workspaces are linked.
- **Type or lint errors after adding files** → run `npm run typecheck` and
  `npm run lint` to see details; `npm run lint:fix` and `npm run format` fix most.
