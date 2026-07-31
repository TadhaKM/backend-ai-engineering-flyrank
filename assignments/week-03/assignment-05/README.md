# Assignment 05 — Connecting your CRUD to a database

> **Status:** 🟢 Complete — CRUD + persistence verified with tests and a real restart.

The sequel to [assignment-01](../../week-01/assignment-01/). That one built a CRUD
to-do API whose data lived in an array and vanished on every restart. This one keeps
**exactly the same API** and swaps the array for a real **SQLite** database, so the
data survives.

The headline: almost nothing about the API changes. Same paths, same methods, same
responses. Only the storage layer is different — and that separation is the entire
lesson.

```
Client ──▶ API ──▶ SQL database        (was: Client ──▶ API ──▶ array in memory)
```

---

## Endpoints

Identical to assignment-01, plus a `/stats` extra.

| Method & path       | Body                     | Success        | Errors               |
| ------------------- | ------------------------ | -------------- | -------------------- |
| `GET /`             | —                        | `200` API info | —                    |
| `GET /tasks`        | — (`?done=`, `?search=`) | `200` array    | `400` bad `?done=`   |
| `GET /tasks/:id`    | —                        | `200` task     | `400` bad id · `404` |
| `POST /tasks`       | `{ "title", "done"? }`   | `201` task     | `400` bad body       |
| `PUT /tasks/:id`    | `{ "title"?, "done"? }`  | `200` task     | `400` · `404`        |
| `DELETE /tasks/:id` | —                        | `204` empty    | `400` · `404`        |
| `GET /stats`        | —                        | `200` counts   | —                    |

A task is `{ id, title, done, created_at, updated_at }`. `done` is always a real
boolean in the API, even though SQLite stores it as `0`/`1`.

---

## Run it

```bash
npm install                 # from the repo root, once
npm start --workspace @flyrank/assignment-05
```

```text
Tasks API running at http://localhost:3000  (database: tasks.db)
```

On the **first** run it creates `tasks.db` next to `server.js`, builds the `tasks`
table, and seeds three example tasks. Every run after that just opens the existing
file. Stop with **Ctrl+C**.

### Prove the data survives a restart

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" -d '{"title":"Survive a restart"}'
# ... stop the server (Ctrl+C), start it again ...
curl http://localhost:3000/tasks       # your task is still there
```

This is the moment the assignment is about. In assignment-01, that task would be gone.

---

## Tests

```bash
npm test --workspace @flyrank/assignment-05     # or `npm test` from the root
```

Vitest + supertest drive the real API against a throwaway database in a temp file — no
port, no network. The two tests that matter most prove the point of the whole
assignment: **data survives a close-and-reopen**, and **the seed data appears exactly
once** (not three more rows on every restart).

---

## Why SQLite?

- **Zero setup.** No server to install or run, unlike Postgres (which is what
  [assignment-03](../../week-02/assignment-03/) uses). The database is a single file,
  `tasks.db`, created automatically on first run.
- **Real SQL.** It is a genuine relational database — the `SELECT`/`INSERT`/`UPDATE`/
  `DELETE` you write here are the same statements you would write against Postgres or
  MySQL. Moving to a bigger database later is mostly a change of connection, not of
  concepts.
- **Right-sized for the lesson.** The point is "persistence behind an unchanged API",
  not "operate a database server". SQLite gets straight to it.

`better-sqlite3` is the driver: synchronous (no `async`/`await` noise for a local
file), fast, and it makes prepared statements — the thing that keeps user input out of
your SQL — the natural way to write queries.

### Where the data lives

A single file, `tasks.db`, in this folder (override with `DB_FILE`). SQLite also creates
`tasks.db-wal` and `tasks.db-shm` sidecars while running; that is normal. All three are
git-ignored — the table and seed data rebuild themselves on first run, so there is
nothing to commit. Delete the file to start fresh.

---

## Some SQL you can run yourself

Open the database with any SQLite viewer ([DB Browser for SQLite](https://sqlitebrowser.org/)
is the friendly one) or the `sqlite3` CLI, and watch the API reflect your changes live:

```sql
SELECT * FROM tasks;                 -- everything
SELECT * FROM tasks WHERE done = 1;  -- only completed (done is 0/1 in storage)
SELECT COUNT(*) FROM tasks;          -- how many
UPDATE tasks SET done = 1;           -- mark them all done
DELETE FROM tasks WHERE done = 1;    -- delete the completed ones
```

After any of these, hit `GET /tasks` again — the API is just a window onto this table.

> 📸 **Screenshot for your submission:** open `tasks.db` in DB Browser, run
> `SELECT * FROM tasks;`, and screenshot the grid. Save it as `db-screenshot.png` here:
> `![tasks.db in DB Browser](db-screenshot.png)`

---

## Project structure

```text
assignment-05/
├── server.js          # entry point: open db, build app, listen, close cleanly
├── app.js             # builds the Express app over a store (kept separate so tests can drive it)
├── db.js              # THE ONLY FILE THAT KNOWS SQL: schema, seed, and the CRUD queries
├── routes/tasks.js    # HTTP layer: methods, status codes, validation — no SQL
├── tests/tasks.test.js
└── package.json
```

**The one idea to take away:** `routes/tasks.js` never sees a SQL string, and `db.js`
never sees an HTTP request. The API sits on one side of that line and the storage on the
other. Swap SQLite for Postgres and only `db.js` changes — which is precisely what
[assignment-03](../../week-02/assignment-03/) demonstrates from the other direction.

---

## Notes & limitations

- **Port 3000 is the default** (override with `PORT`). Only one server can use it at a
  time.
- **`?search=`** is a case-insensitive substring match (SQL `LIKE`), ASCII only.
- **No auth, no pagination.** Out of scope; this assignment is about persistence.
