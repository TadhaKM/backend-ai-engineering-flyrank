# scripts

Repo automation. Run these from the repo root.

| Script               | Command                                       | Purpose                            |
| -------------------- | --------------------------------------------- | ---------------------------------- |
| `new-assignment.mjs` | `npm run new:assignment -- --week <n> [name]` | Scaffold a new numbered assignment |

## `new-assignment.mjs`

Copies [`../templates/assignment/`](../templates/assignment/) into a new folder inside
the given week, choosing the next unused number and replacing the template tokens
(`__WEEK__`, `__FOLDER__`, `__NUMBER__`, `__SLUG__`, `__TITLE__`, `__PACKAGE__`).

```bash
npm run new:assignment -- --week 2         # -> assignments/week-02/assignment-02
npm run new:assignment -- --week 2 rag     # -> assignments/week-02/02-rag
```

**`--week` is required** — every assignment lives inside a week folder. The week
folder is created if it doesn't exist.

**Numbering:** assignment numbers are a **single global sequence across all weeks**.
The next number is (highest found in any week) + 1, so numbers are never reused.

**Naming:** the default is `assignment-NN` (zero-padded, so folders keep sorting past
10). Pass a kebab-case name only when the assignment has a meaningful topic — that
produces `NN-slug`, e.g. `02-rag`.

It refuses to overwrite an existing folder, so previous work is always safe.
Zero dependencies — Node built-ins only.
