# Conventions

Shared conventions keep 20+ assignments feeling like one coherent workspace.

## Naming

- **Assignment folders:** `assignment-NN` by default — two-digit, zero-padded
  (`assignment-02`, `assignment-03`). Numbers only increase. Use a topical
  `NN-slug` name (e.g. `01-ai-core`) only when the assignment genuinely has one.
- **Package names:** `@flyrank/<folder-name>` for assignments, `@flyrank/shared` for shared.
- **Files:** kebab-case (`rate-limiter.ts`). Tests end in `.test.ts`.
- **Types/interfaces:** `PascalCase`. **Variables/functions:** `camelCase`.
  **Constants:** `UPPER_SNAKE_CASE`.

## TypeScript

- ESM only (`"type": "module"`). Strict mode is on repo-wide — don't loosen it
  per assignment without a note explaining why.
- Prefer explicit return types on exported functions.
- `verbatimModuleSyntax` is on: use `import type { X }` for type-only imports.
- Avoid `any`; it's a lint warning. Reach for `unknown` + narrowing instead.
- No default exports for library code — prefer named exports.

## Formatting & linting

- **Prettier** owns formatting (`npm run format`). Don't hand-format.
- **ESLint** owns correctness/style rules (`npm run lint`). Fix warnings before
  committing.
- Config lives once at the root; assignments inherit it. Don't add per-assignment
  ESLint/Prettier configs unless there's a real, documented reason.

## Testing

- **Vitest** for all tests. Co-locate under each workspace's `tests/` folder.
- Every non-trivial function in `shared/` gets a test.
- Aim for tests that describe behaviour, not implementation details.

## Environment & secrets

- Document every variable in `.env.example`.
- Never commit `.env` or real keys (enforced by [`.gitignore`](../.gitignore)).
- Read env through `@flyrank/shared` helpers (`requireEnv`, `envNumber`, …) so
  failures are explicit and consistent.

## Logging

- Use `createLogger({ name })` from `@flyrank/shared` rather than raw
  `console.log`. Control verbosity with `LOG_LEVEL`.

## Git & commits

- Work on the `main` branch or a short-lived feature branch per assignment.
- **Conventional-commit style** is encouraged:
  `feat(assignment-02): add retrieval pipeline`, `docs: update root progress table`,
  `chore(shared): add retry helper`.
- Scope commits to one assignment where possible; never bundle edits to multiple
  assignments in one commit unless they're genuinely related (e.g. a `shared/`
  change).
- Don't commit `node_modules`, build output, or secrets.

## Reuse discipline

- Promote code to `shared/` only when a **second** assignment needs it.
- Never import from one assignment into another.
- Keep `shared/` dependency-light — it's imported everywhere.
