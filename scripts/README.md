# scripts

Repo automation. Run these from the repo root.

| Script               | Command                            | Purpose                            |
| -------------------- | ---------------------------------- | ---------------------------------- |
| `new-assignment.mjs` | `npm run new:assignment [-- name]` | Scaffold a new numbered assignment |

## `new-assignment.mjs`

Copies [`../templates/assignment/`](../templates/assignment/) into a new folder,
choosing the next unused number and replacing the template tokens (`__FOLDER__`,
`__NUMBER__`, `__SLUG__`, `__TITLE__`, `__PACKAGE__`).

```bash
npm run new:assignment            # -> assignments/assignment-02   (default)
npm run new:assignment -- rag     # -> assignments/02-rag          (named override)
```

**Naming:** the default is `assignment-NN` (zero-padded, so folders keep sorting
past 10). Pass a kebab-case name only when the assignment has a meaningful topic —
that produces `NN-slug`, e.g. `02-rag`.

The next-number scan understands **both** folder conventions, so numbering stays
correct however you mix them.

It refuses to overwrite an existing folder, so previous work is always safe.
Zero dependencies — Node built-ins only.
