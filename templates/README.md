# Templates

Copy-paste starting points that keep every assignment consistent. Nothing here
runs on its own — `templates/` is intentionally excluded from the npm
workspaces and from linting.

## Contents

| Path                                           | Use it for                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| [`assignment/`](assignment/)                   | The full, ready-to-copy assignment skeleton (used by the generator) |
| [`assignment-README.md`](assignment-README.md) | A standalone README template for a single assignment                |
| [`project-README.md`](project-README.md)       | A README template for a larger, project-style assignment            |
| [`env.example`](env.example)                   | A documented environment-variable starting point                    |
| [`folder-structure.md`](folder-structure.md)   | The canonical assignment folder layout, explained                   |

## Two ways to start a new assignment

### 1. Automated (recommended)

```bash
npm run new:assignment -- <slug>     # e.g. npm run new:assignment -- rag
```

This copies [`assignment/`](assignment/), picks the next number automatically,
and replaces the template tokens. See [`../scripts/new-assignment.mjs`](../scripts/new-assignment.mjs).

### 2. Manual

1. Copy [`assignment/`](assignment/) to `../assignments/NN-slug/`.
2. Replace the tokens below throughout the copied files.
3. Update the root and `assignments/` progress tables.

## Template tokens (in `assignment/`)

The files in [`assignment/`](assignment/) contain placeholder tokens the
generator replaces. If you copy manually, replace them yourself:

| Token         | Meaning                     | Example           |
| ------------- | --------------------------- | ----------------- |
| `__NUMBER__`  | Two-digit assignment number | `02`              |
| `__SLUG__`    | Kebab-case slug             | `rag`             |
| `__TITLE__`   | Human-readable title        | `RAG`             |
| `__PACKAGE__` | Workspace package name      | `@flyrank/02-rag` |
