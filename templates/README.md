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
npm run new:assignment -- --week 2         # -> assignments/week-02/assignment-02
npm run new:assignment -- --week 2 rag     # -> assignments/week-02/02-rag
```

This copies [`assignment/`](assignment/) into the given week, picks the next number
automatically, and replaces the template tokens.
See [`../scripts/new-assignment.mjs`](../scripts/new-assignment.mjs).

### 2. Manual

1. Copy [`assignment/`](assignment/) to `../assignments/week-NN/assignment-NN/`.
2. Replace the tokens below throughout the copied files.
3. Update the root and `assignments/` progress tables.

## Template tokens (in `assignment/`)

The files in [`assignment/`](assignment/) contain placeholder tokens the
generator replaces. If you copy manually, replace them yourself:

| Token         | Meaning                     | Example (default)        | Example (named)   |
| ------------- | --------------------------- | ------------------------ | ----------------- |
| `__WEEK__`    | The week folder             | `week-02`                | `week-02`         |
| `__FOLDER__`  | The assignment folder name  | `assignment-02`          | `02-rag`          |
| `__NUMBER__`  | Two-digit assignment number | `02`                     | `02`              |
| `__SLUG__`    | Kebab-case slug             | `assignment-02`          | `rag`             |
| `__TITLE__`   | The topic (not the number)  | `TBD`                    | `RAG`             |
| `__PACKAGE__` | Workspace package name      | `@flyrank/assignment-02` | `@flyrank/02-rag` |

> `__WEEK__` and `__FOLDER__` exist because templates can't compose the path: the
> folder is **not** always `NN-slug`, and it now sits one level deeper inside a week.
> That's also why the template's `tsconfig.json` extends `../../../tsconfig.json`.
