# Assignment 05 — Explanation

> **What this file is:** a plain-English walkthrough of what was built and _why_ —
> written so a non-technical reader can follow it.
>
> **How it differs from [`README.md`](README.md):** the README tells you how to run it
> and lists the endpoints. This file explains the one big idea underneath.

---

## 1. What the task was

Take the to-do CRUD API from [assignment-01](../../week-01/assignment-01/) — the one
whose tasks disappeared every time the server restarted — and give it a **real
database** so the tasks stick around. And do it **without changing the API**: the same
web addresses, the same requests, the same answers.

If that sounds anticlimactic, that is the point. The magic trick is that from the
outside, nothing changes. From the inside, the storage was replaced entirely.

---

## 2. Why the old version lost your data

In assignment-01, the tasks lived in a list _inside the running program_:

```js
const tasks = [ ... ];   // lives in the computer's memory
```

Memory is temporary. When the program stops, everything it was holding is gone — the
way the contents of your mind at a given second aren't written down anywhere. Restart
the server and the list is back to its three starter tasks. Fine for learning the
shape of an API; useless for anything real.

A **database** is a separate program whose entire job is to write data to disk in a way
that survives restarts, crashes, and power cuts. Your app hands data to it and asks for
it back later. This assignment uses **SQLite**, which is the simplest kind: the whole
database is a single file on disk, `tasks.db`, and there is no separate server to run.

Once the data outlives the program, the project stops being a toy.

---

## 3. The big idea: the API is a promise, the database is a detail

Here is the shape of assignment-01:

```
Client ──▶ API ──▶ a list in memory
```

And here is assignment-05:

```
Client ──▶ API ──▶ a SQL database
```

**The client cannot tell the difference.** `GET /tasks` still lists tasks. `POST /tasks`
still creates one. `DELETE` still deletes. The web addresses, the request bodies, and
the responses are identical. The _only_ observable change is that restarting the server
no longer wipes everything.

This is one of the foundational ideas in backend engineering: **what your application
does (the API) is a separate concern from where it keeps its data (the database).** Get
that separation right and you can change the database later — SQLite today, Postgres next
year — without your users, or most of your own code, noticing.

---

## 4. How the code keeps that promise

The trick is a clean line drawn through the code. Three files, three jobs, and they are
not allowed to reach across the line:

| File              | Its job                                 | What it must NOT know        |
| ----------------- | --------------------------------------- | ---------------------------- |
| `routes/tasks.js` | HTTP: methods, status codes, validation | anything about SQL           |
| `db.js`           | SQL: the schema, seeding, queries       | anything about HTTP requests |
| `app.js`          | wires the two together                  | —                            |

`routes/tasks.js` calls plain functions — `store.list()`, `store.create(...)`,
`store.remove(id)` — and never sees a single line of SQL. `db.js` runs the SQL and
never sees a web request. Because of that wall, swapping SQLite for Postgres would mean
rewriting `db.js` and touching nothing else. (Assignment 03 proves the same point from
the opposite side: it keeps the storage and swaps between two of them behind an
identical interface.)

### The small translations that keep the API identical

Two details had to be handled so the database's quirks never leak out to the client:

- **SQLite has no `true`/`false`.** It stores booleans as the numbers `0` and `1`. But
  assignment-01's API always returned a real `true`/`false`, and this one must match.
  So `db.js` converts `0`/`1` back into a proper boolean at the single spot where rows
  leave the storage layer. The client keeps seeing `"done": true`, exactly as before.

- **The table and the seed data build themselves.** The first time the server starts, it
  runs `CREATE TABLE IF NOT EXISTS` and, only if the table is empty, inserts three
  example tasks. `IF NOT EXISTS` and the empty-check are what make it safe to run this on
  _every_ startup: the first run sets everything up, and every run after that is a
  harmless no-op. There is no separate "install the database" step to forget.

---

## 5. Keeping user input out of the SQL

There is a classic, genuinely dangerous mistake when writing database code: building a
query by gluing user input into a string. If a task title can end up _inside_ the SQL
text, a malicious title can rewrite the query — that is **SQL injection**, one of the
oldest ways to break into a system.

This project never does that. Every query uses **prepared statements**: the SQL is
written once with `?` placeholders, and the actual values are handed to SQLite
separately. A value passed that way is _always_ treated as data, never as SQL, no matter
what it contains. A task cleverly titled `'; DROP TABLE tasks; --` is stored as that
literal, silly string and nothing happens.

It is also faster — SQLite analyses the statement once and reuses it — but safety is the
reason that matters.

---

## 6. How it was verified

Two ways, because "the file exists" is not proof of anything.

**Automated tests** drive the real API against a throwaway database. The two that carry
the assignment:

- **Data survives a restart.** Create a task, close the database entirely, reopen the
  same file, and confirm the task is still there. This is the whole feature, tested
  directly.
- **The seed runs exactly once.** Open a database (3 tasks appear), close it, reopen it,
  and confirm there are still 3 — not 6. If the empty-check were wrong, every restart
  would pile on three more.

Plus the ordinary CRUD checks: create returns `201`, unknown ids return `404`, bad input
returns `400`, delete returns `204`, the `?done=` and `?search=` filters work, and
`/stats` counts correctly.

**By hand,** the real thing: start the server, create a task, stop the server, start it
again, ask for the tasks — and watch the created one still be there. In assignment-01
that task would have been gone. Seeing it survive is the assignment clicking into place.

---

## 7. Where this sits

- **Back:** [assignment-01](../../week-01/assignment-01/) is the same CRUD API with an
  in-memory array. Reading the two side by side shows how little the routes change when
  the storage is swapped.
- **Sideways:** [assignment-03](../../week-02/assignment-03/) does persistence with
  Postgres and a swappable repository — the heavier, production-shaped version of the
  same idea.
