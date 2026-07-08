# Architecture & design decisions

This document explains **why** the workspace is shaped the way it is. If you're
just trying to run things, see [getting-started.md](getting-started.md).

## The core idea: a portfolio, not a project

The repo holds **many independent assignments**, added over time, never
overwritten. Each is self-contained so it can be read, run, and understood in
isolation — like a portfolio piece. The structure optimises for:

1. **Adding the Nth assignment cheaply** (consistency + templates + a generator).
2. **Preserving history** (old assignments are immutable records).
3. **Controlled reuse** (one shared package, not tangled cross-imports).

## Monorepo via npm workspaces

```text
root (dev tooling: TS, ESLint, Prettier, Vitest)
├── shared/            → package @flyrank/shared
├── assignments/week-*/*  → one package per assignment (grouped by week)
└── extras/*              → non-assignment projects
```

**Why workspaces?**

- One `npm install` links everything; assignments import `@flyrank/shared` by
  name, not by fragile relative paths (`../../../shared`).
- Dev tooling is defined **once** at the root, so every assignment is linted,
  formatted, type-checked, and tested identically.
- Each assignment still owns its own `package.json`, so it can add its own
  dependencies and stay independently runnable.

**Trade-off considered:** fully separate repos per assignment would maximise
isolation but destroy consistency and make shared code impossible. A single
monorepo with per-assignment packages is the sweet spot.

## No build step

`tsx` (for running) and Vitest (for testing) execute TypeScript directly. The
shared package is consumed as **source** (`"main": "./src/index.ts"`), so there's
nothing to compile before an assignment can use it. `tsc` is used only for
type-checking (`noEmit`). This keeps the feedback loop instant and removes a
whole class of "did you rebuild shared?" problems.

## Strict, modern TypeScript

The root [`tsconfig.json`](../tsconfig.json) turns on `strict` plus
`noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, and modern module
settings (`ESNext` + `Bundler` resolution). Every workspace extends it, so
quality standards are uniform and set in exactly one place.

## The `shared/` boundary

`shared/` is the **only** sanctioned reuse mechanism. Rules:

- Code goes in `shared/` only when a **second** assignment needs it (avoid
  speculative abstractions).
- No assignment imports another assignment — ever.
- `shared/` has no assignment-specific logic and minimal dependencies, since it's
  imported everywhere.

This gives a clear dependency graph: `assignments/week-*/* → shared`, and nothing else.

## Consistency machinery

- **Templates** ([`../templates/`](../templates/)) define the canonical shape.
- **Generator** ([`../scripts/new-assignment.mjs`](../scripts/new-assignment.mjs))
  stamps out a new assignment with the next number and correct names.
- **CI** ([`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs the
  same `npm run check` gate on every push/PR.

## What deliberately isn't here (yet)

To avoid over-engineering, the foundation stops short of things assignments can
add when actually needed: a web framework, Docker, database layers, or a
publish/versioning pipeline for `shared/`. Add them per-assignment, or promote to
the root only when the pain is real.
