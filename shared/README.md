# `@flyrank/shared`

Reusable building blocks shared across **every** assignment. This folder is a
workspace package published locally as `@flyrank/shared`, so any assignment can:

```ts
import { createLogger, requireEnv, ok, err, type Result } from '@flyrank/shared';
```

## What belongs here

✅ Genuinely reusable, assignment-agnostic code:

- **logging** — `createLogger`, `logger`
- **configuration / env** — `requireEnv`, `getEnv`, `envNumber`, `envBool`
- **shared types & helpers** — `Result`, `ok`, `err`, `tryCatch`
- **errors** — `AppError`, `ConfigError`
- common AI abstractions (clients, prompt helpers, retry logic) as they emerge

## What does NOT belong here

❌ Anything that only makes sense for one assignment. If in doubt, keep it in the
assignment. Promote code to `shared/` only once a **second** assignment needs it.

## Layout

```text
shared/
├── src/
│   ├── index.ts     # Barrel — the public API. Import from '@flyrank/shared'.
│   ├── logger.ts    # Structured JSON logger
│   ├── env.ts       # Typed environment-variable helpers
│   ├── result.ts    # Result<T, E> type + helpers
│   └── errors.ts    # AppError / ConfigError
└── tests/
    └── shared.test.ts
```

## Conventions

- Everything reusable must be exported from [`src/index.ts`](src/index.ts).
- Add a test in `tests/` for any non-trivial helper.
- No side effects on import — modules should only export.
- Keep dependencies minimal; this package is imported everywhere.

## Commands

```bash
npm run typecheck --workspace shared
npm run test --workspace shared
```
