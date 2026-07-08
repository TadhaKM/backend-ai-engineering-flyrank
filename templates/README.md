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
npm run new:assignment            # -> assignments/assignment-02   (default)
npm run new:assignment -- rag     # -> assignments/02-rag          (named override)
```

This copies [`assignment/`](assignment/), picks the next number automatically,
and replaces the template tokens. See [`../scripts/new-assignment.mjs`](../scripts/new-assignment.mjs).

### 2. Manual

1. Copy [`assignment/`](assignment/) to `../assignments/assignment-NN/`.
2. Replace the tokens below throughout the copied files.
3. Update the root and `assignments/` progress tables.

## Template tokens (in `assignment/`)

The files in [`assignment/`](assignment/) contain placeholder tokens the
generator replaces. If you copy manually, replace them yourself:

| Token         | Meaning                       | Example (default)             | Example (named)   |
| ------------- | ----------------------------- | ----------------------------- | ----------------- |
| `__FOLDER__`  | The folder name               | `assignment-02`               | `02-rag`          |
| `__NUMBER__`  | Two-digit assignment number   | `02`                          | `02`              |
| `__SLUG__`    | Kebab-case slug               | `assignment-02`               | `rag`             |
| `__TITLE__`   | The topic (not the number)    | `TBD`                         | `RAG`             |
| `__PACKAGE__` | Workspace package name        | `@flyrank/assignment-02`      | `@flyrank/02-rag` |

> `__FOLDER__` exists because under the default naming the folder is **not**
> `NN-slug` — templates must reference the folder directly, never `__NUMBER__-__SLUG__`.
