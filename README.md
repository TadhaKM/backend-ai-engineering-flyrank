# Backend AI Engineering — FlyRank

> A growing, professional workspace for backend AI engineering work completed during the FlyRank internship.
> Each assignment lives in its own self-contained folder. The repository is designed to scale to **20+ projects** without turning into a mess.

[![CI](https://github.com/TadhaKM/backend-ai-engineering-flyrank/actions/workflows/ci.yml/badge.svg)](https://github.com/TadhaKM/backend-ai-engineering-flyrank/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![License](https://img.shields.io/badge/license-MIT-informational)

---

## Table of Contents

- [What this repository is](#what-this-repository-is)
- [How the workspace is organised](#how-the-workspace-is-organised)
- [Quick start](#quick-start)
- [How to add a new assignment](#how-to-add-a-new-assignment)
- [Repository rules](#repository-rules)
- [The `shared/` folder](#the-shared-folder)
- [Technology stack](#technology-stack)
- [Progress](#progress)
- [Documentation](#documentation)

---

## What this repository is

This is **not** a single application. It is an **engineering portfolio and workspace**.

Over the course of the internship, many separate assignments will be completed — an AI core, a RAG pipeline, agents, auth, streaming, and whatever comes next. Rather than scattering these across many repositories or overwriting one project again and again, every assignment is preserved here as an **independent, self-contained project** inside [`assignments/`](assignments/).

The goals of this structure are:

- **Scalability** — adding the 15th assignment is as easy as adding the 2nd.
- **Preservation** — earlier work is never overwritten or deleted.
- **Consistency** — every assignment looks and runs the same way.
- **Reusability** — genuinely common code lives once, in [`shared/`](shared/).

---

## How the workspace is organised

```text
backend-ai-engineering-flyrank/
│
├── README.md                 # You are here — the workspace overview
├── LICENSE                   # MIT
├── package.json              # Root workspace: shared dev tooling + scripts
├── tsconfig.json             # Strict, modern TS base that every project extends
├── .eslintrc.cjs             # Lint rules (shared across all assignments)
├── .prettierrc               # Formatting rules
├── .editorconfig             # Editor defaults
│
├── assignments/              # ⭐ Assignments, grouped into week-01 … week-10
│   ├── README.md             #    Index + the assignment workflow
│   ├── week-01/
│   │   └── assignment-01/    #    Assignment 01 — minimal Express backend
│   │       ├── README.md
│   │       ├── server.js
│   │       ├── package.json
│   │       └── .gitignore
│   └── week-02/ … week-10/   #    Empty, ready to be filled
│
├── extras/                   # Non-assignment projects (practice builds, spikes)
│   └── 01-ai-core/           #    AI backend: Portkey gateway, Claude tool use, guardrails
│
├── shared/                   # Reusable code ONLY (logger, config, types, helpers)
│
├── templates/                # Copy-paste starting points for new assignments
│
├── docs/                     # Cross-cutting documentation & conventions
│
└── scripts/                  # Repo automation (e.g. the new-assignment generator)
```

The rule of thumb: **assignments own their code; `shared/` owns what more than one assignment needs.**

---

## Quick start

Requires **Node.js ≥ 20** (see [`.nvmrc`](.nvmrc)).

```bash
# 1. Install all workspace dependencies (root + shared + every assignment)
npm install

# 2. Verify the whole workspace is healthy
npm run check          # format check + lint + typecheck + tests

# 3. Work inside a single assignment
cd assignments/week-01/assignment-01
npm start              # (assignments that need secrets: cp .env.example .env first)
```

### Root scripts

| Command                  | What it does                                         |
| ------------------------ | ---------------------------------------------------- |
| `npm run new:assignment` | Scaffold a new numbered assignment from the template |
| `npm run lint`           | Lint every workspace                                 |
| `npm run format`         | Format the entire repo with Prettier                 |
| `npm run typecheck`      | Type-check every workspace                           |
| `npm test`               | Run all tests (Vitest)                               |
| `npm run check`          | Everything above — the same gate CI runs             |

> Any script can be scoped to one workspace:
> `npm start --workspace assignments/week-01/assignment-01`

---

## How to add a new assignment

**The golden path (recommended):**

```bash
npm run new:assignment -- --week 2         # -> assignments/week-02/assignment-02
npm run new:assignment -- --week 2 rag     # -> assignments/week-02/02-rag
```

`--week` is required — every assignment lives inside a week folder. The generator
picks the next number automatically, copies the template, and wires up the folder.
See [`scripts/new-assignment.mjs`](scripts/new-assignment.mjs).

**Numbering:** assignment numbers are a **single global sequence across all weeks**,
so they're never reused. Weeks just group them.

**Naming:** folders default to `assignment-NN` (zero-padded, so they keep sorting
past 10). Give an assignment a topical `NN-slug` name only when it genuinely has
one.

**Manually (if you prefer):**

1. Copy [`templates/assignment/`](templates/assignment/) to
   `assignments/week-NN/assignment-NN/` — where the assignment `NN` is the **next unused number** across all weeks.
2. Update the new assignment's `README.md`, `package.json` (`name` field), and
   `.env.example`.
3. Add a row to the [Progress](#progress) table below.
4. Commit the new folder on its own — never edit older assignments.

A full walkthrough lives in [`docs/adding-an-assignment.md`](docs/adding-an-assignment.md).

---

## Repository rules

These rules keep the workspace clean as it grows. **Follow them for every assignment.**

1. **Never overwrite an existing assignment.** Old work is a record of progress — it stays.
2. **Always create a new numbered folder** (`assignment-NN`) for new work. Numbers only ever go up.
3. **Preserve previous work.** No deleting or renaming completed assignments.
4. **Keep every assignment independently runnable.** Someone should be able to `cd` into any assignment and run it without touching the others.
5. **Assignments do not depend on other assignments.** If two need the same code, promote it to [`shared/`](shared/).
6. **Reuse only through `shared/`.** Never `import` across assignment folders.
7. **Document every assignment separately.** Each one gets its own `README.md`.
8. **Never commit secrets.** Commit `.env.example`, never `.env`.

---

## The `shared/` folder

[`shared/`](shared/) is published to the workspace as the package **`@flyrank/shared`**.
Any assignment can use it:

```ts
import { createLogger, loadEnv } from '@flyrank/shared';
```

It is **only** for genuinely reusable building blocks:

- ✅ utility/helper functions
- ✅ shared TypeScript types
- ✅ logging
- ✅ configuration / environment loading
- ✅ common AI abstractions (clients, prompt helpers, retry logic…)

It is **not** for assignment-specific logic. If code only makes sense for one
assignment, it belongs in that assignment, not here.

---

## Technology stack

| Concern         | Choice                                         |
| --------------- | ---------------------------------------------- |
| Language        | TypeScript (strict), ESM                       |
| Runtime         | Node.js ≥ 20                                   |
| Package manager | npm (workspaces)                               |
| Test runner     | Vitest                                         |
| Linting         | ESLint + `@typescript-eslint`                  |
| Formatting      | Prettier                                       |
| Run/dev         | `tsx` (run TypeScript directly, no build step) |

Individual assignments may add their own dependencies (web frameworks, vector
DBs, AI SDKs, etc.) in their own `package.json` — the root only owns shared
tooling.

---

## Progress

Legend: 🟢 done · 🟡 in progress · ⚪ scaffolded / not started

| #   | Week | Assignment              | Folder                                                                   | Status | Summary                                         |
| --- | ---- | ----------------------- | ------------------------------------------------------------------------ | ------ | ----------------------------------------------- |
| 01  | 1    | Minimal Express backend | [`assignments/week-01/assignment-01`](assignments/week-01/assignment-01) | 🟢     | Express server on :3000 with two JSON endpoints |

> When you start a new assignment, add a row here. Keep it newest-last so the
> table reads as a timeline.

### Extras

Non-assignment projects live in [`extras/`](extras/) and are excluded from the
numbered sequence above.

| Project                                  | Status | Summary                                                                 |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------- |
| [`extras/01-ai-core`](extras/01-ai-core) | 🟢     | Portkey gateway + Claude tool use, Zod-validated output, SQL guardrails |

---

## Documentation

| Doc                                                            | Purpose                                    |
| -------------------------------------------------------------- | ------------------------------------------ |
| [`docs/getting-started.md`](docs/getting-started.md)           | Install, run, and work in the repo         |
| [`docs/architecture.md`](docs/architecture.md)                 | Why the repo is shaped the way it is       |
| [`docs/adding-an-assignment.md`](docs/adding-an-assignment.md) | Step-by-step guide to add a new assignment |
| [`docs/conventions.md`](docs/conventions.md)                   | Coding, naming, and commit conventions     |
| [`assignments/README.md`](assignments/README.md)               | The assignment index and workflow          |
| [`templates/README.md`](templates/README.md)                   | How to use the templates                   |

---

<sub>Maintained as part of the FlyRank backend AI engineering internship.</sub>
