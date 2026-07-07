# Adding a new assignment

Every new assignment is a **new numbered folder** under `assignments/`. You never
edit or overwrite an existing one.

## Option A — the generator (recommended)

From the repo root:

```bash
npm run new:assignment -- <slug>
# examples:
npm run new:assignment -- rag
npm run new:assignment -- agents
```

The generator:

1. Finds the highest existing number in `assignments/` and adds 1.
2. Validates your slug (lowercase, kebab-case).
3. Copies [`templates/assignment/`](../templates/assignment/) to
   `assignments/NN-slug/`.
4. Replaces the template tokens (`__NUMBER__`, `__SLUG__`, `__TITLE__`, `__PACKAGE__`).

If you omit the slug, the script prompts for one.

After it runs:

```bash
npm install                          # link the new workspace
cd assignments/NN-slug
cp .env.example .env
npm run dev
```

## Option B — manual

1. **Pick the number.** Look at `assignments/`, take the highest `NN`, add 1.
2. **Copy the template:**
   ```bash
   cp -r templates/assignment assignments/NN-slug
   ```
3. **Replace tokens** in every copied file:
   | Token         | Replace with           |
   | ------------- | ---------------------- |
   | `__NUMBER__`  | e.g. `02`              |
   | `__SLUG__`    | e.g. `rag`             |
   | `__TITLE__`   | e.g. `RAG`             |
   | `__PACKAGE__` | e.g. `@flyrank/02-rag` |
4. `npm install` at the root to link the workspace.

## Then, for either option

1. **Write the README** — goal, approach, how to run, notes.
2. **Add dependencies** to the assignment's own `package.json` as needed.
3. **Update the progress tables:**
   - root [`README.md`](../README.md#progress)
   - [`assignments/README.md`](../assignments/README.md#index)
4. **Verify it's healthy:**
   ```bash
   npm run check --workspace assignments/NN-slug   # or `npm run check` for everything
   ```
5. **Commit the new folder on its own.** Don't mix it with edits to other
   assignments.

## Checklist

- [ ] New folder is `NN-slug`, number is previous highest + 1
- [ ] No existing assignment was modified
- [ ] `package.json` `name` is `@flyrank/NN-slug`
- [ ] README describes goal + how to run
- [ ] `.env.example` documents any secrets; `.env` is not committed
- [ ] Reused code comes from `@flyrank/shared`, not another assignment
- [ ] Progress tables updated
- [ ] `npm run check` passes
