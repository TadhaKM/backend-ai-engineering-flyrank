# Adding a new assignment

Every new assignment is a **new numbered folder** under `assignments/`. You never
edit or overwrite an existing one.

## Naming

The **default** is `assignment-NN` (zero-padded, so folders keep sorting past 10).
Only give an assignment a topical name when it genuinely has one — then it's
`NN-slug` (e.g. `02-rag`).

## Option A — the generator (recommended)

From the repo root:

```bash
npm run new:assignment            # -> assignments/assignment-02   (default)
npm run new:assignment -- rag     # -> assignments/02-rag          (named override)
```

The generator:

1. Finds the highest existing number in `assignments/` and adds 1 (it understands
   both `NN-slug` and `assignment-NN` folders).
2. Picks the folder name: `assignment-NN` by default, or `NN-slug` if you passed a name.
3. Copies [`templates/assignment/`](../templates/assignment/) into it.
4. Replaces the template tokens (`__FOLDER__`, `__NUMBER__`, `__SLUG__`, `__TITLE__`, `__PACKAGE__`).

It refuses to overwrite an existing folder.

After it runs:

```bash
npm install                          # link the new workspace
cd assignments/week-NN/assignment-NN
cp .env.example .env
npm run dev
```

## Option B — manual

1. **Pick the number.** Look at `assignments/`, take the highest `NN`, add 1.
2. **Copy the template:**
   ```bash
   cp -r templates/assignment assignments/week-NN/assignment-NN
   ```
3. **Replace tokens** in every copied file:
   | Token         | Replace with                   |
   | ------------- | ------------------------------ |
   | `__FOLDER__`  | e.g. `assignment-02`           |
   | `__NUMBER__`  | e.g. `02`                      |
   | `__SLUG__`    | e.g. `assignment-02`           |
   | `__TITLE__`   | the topic, e.g. `RAG` or `TBD` |
   | `__PACKAGE__` | e.g. `@flyrank/assignment-02`  |
4. `npm install` at the root to link the workspace.

## Then, for either option

1. **Write the README** — goal, approach, how to run, notes.
   1b. **Write EXPLANATION.md** — a beginner-friendly account of what you built and why.
2. **Add dependencies** to the assignment's own `package.json` as needed.
3. **Update the progress tables:**
   - root [`README.md`](../README.md#progress)
   - [`assignments/README.md`](../assignments/README.md#index)
4. **Verify it's healthy:**
   ```bash
   npm run check --workspace assignments/week-NN/assignment-NN   # or `npm run check` for everything
   ```
5. **Commit the new folder on its own.** Don't mix it with edits to other
   assignments.

## Checklist

- [ ] New folder is `assignment-NN` (or `NN-slug` if deliberately named), number is previous highest + 1
- [ ] No existing assignment was modified
- [ ] `package.json` `name` is `@flyrank/<folder-name>`
- [ ] README describes goal + how to run
- [ ] EXPLANATION.md written for a beginner (what, why, bugs hit, how verified)
- [ ] `.env.example` documents any secrets; `.env` is not committed
- [ ] Reused code comes from `@flyrank/shared`, not another assignment
- [ ] Progress tables updated
- [ ] `npm run check` passes
