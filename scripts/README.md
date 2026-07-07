# scripts

Repo automation. Run these from the repo root.

| Script               | Command                            | Purpose                            |
| -------------------- | ---------------------------------- | ---------------------------------- |
| `new-assignment.mjs` | `npm run new:assignment -- <slug>` | Scaffold a new numbered assignment |

## `new-assignment.mjs`

Copies [`../templates/assignment/`](../templates/assignment/) into
`assignments/NN-slug/`, choosing `NN` as the next unused number and replacing the
template tokens (`__NUMBER__`, `__SLUG__`, `__TITLE__`, `__PACKAGE__`).

```bash
npm run new:assignment -- rag      # -> assignments/02-rag
npm run new:assignment             # prompts for the slug
```

It refuses to overwrite an existing folder, so previous work is always safe.
Zero dependencies — Node built-ins only.
