# Assignment 01 — Explanation

> **What this file is:** a plain-English walkthrough of what was built and _why_ —
> written so a non-technical reader can follow it.
>
> **How it differs from [`README.md`](README.md):** the README tells you how to run it
> and lists the endpoints. This file explains the ideas underneath.

---

## 1. What the task was

Build a small **API** that manages a to-do list — one you can add to, read from,
change, and delete. Those four actions have a name: **CRUD** (Create, Read, Update,
Delete). Almost every backend in the world is CRUD wearing a costume: a social network
CRUDs posts, a shop CRUDs orders, FlyRank CRUDs SEO reports.

The data is kept in memory for now, which means it vanishes when the server restarts.
That is not a bug — it is the cliffhanger. [Assignment 05](../../week-03/assignment-05/)
picks up these exact endpoints and gives them a real database so the data survives.

---

## 2. What an API actually is

An **API** is a program that waits for requests and sends back responses. Think of it
as a building with several labelled doors. Each door — each **endpoint** — is defined
by two things:

- a **path**: _where_ the door is, like `/tasks` or `/tasks/3`
- an **HTTP method**: _what kind of knock_ it answers — `GET` (give me), `POST` (create
  this), `PUT` (replace this), `DELETE` (remove this)

So `GET /tasks` ("give me all tasks") and `POST /tasks` ("create a task") are **two
different doors** even though the path is identical. The knock is different.

That is the entire mental model. The four CRUD actions are just four knocks:

```
Create  ->  POST   /tasks
Read    ->  GET    /tasks   and   GET /tasks/:id
Update  ->  PUT    /tasks/:id
Delete  ->  DELETE /tasks/:id
```

---

## 3. Status codes: how the server says how it went

Every response carries a three-digit **status code**. It is the server's headline,
readable by machines before any human looks at the body. The ones this API uses:

| Code | Name        | Means                                            |
| ---- | ----------- | ------------------------------------------------ |
| 200  | OK          | Here is what you asked for.                      |
| 201  | Created     | I made the new thing; here is your receipt.      |
| 204  | No Content  | Done — and there is nothing to send back.        |
| 400  | Bad Request | Your input was wrong; don't resend it unchanged. |
| 404  | Not Found   | There is no such thing here.                     |

The single most important habit in this assignment: **when something doesn't exist,
return 404 — never an empty `200`.** A `200` with an empty body tells a machine
"success, here is nothing", which is a lie. `GET /tasks/99` on a list that has no task
99 returns:

```json
404  { "error": "Task 99 not found" }
```

---

## 4. What was built, stage by stage

The whole API is one file, [`server.js`](server.js), a little under 100 lines. It was
built in the order the brief lays out, testing after each step.

**The store.** A plain array, pre-filled with three tasks:

```js
const tasks = [
  { id: 1, title: 'Read the assignment brief', done: true },
  { id: 2, title: 'Build the CRUD API', done: false },
  { id: 3, title: 'Push to GitHub', done: false },
];
let nextId = 4;
```

**Read** (`GET /tasks`, `GET /tasks/:id`). The first returns the whole array. The second
searches it by id and either returns the task or the 404 above. The `:id` in the path is
a **path parameter** — a slot in the URL that changes per request.

**Create** (`POST /tasks`). The client sends `{ "title": "Buy milk" }` in the request
**body**. The server checks the title is really there (missing or blank → `400`), gives
the task the next free id, sets `done` to `false`, adds it, and replies `201` with the
finished task. That validation is the first real rule of backend work: **the server
never trusts the client.**

**Update** (`PUT /tasks/:id`). Finds the task (unknown id → `404`), then changes the
`title` and/or `done` from the body (nothing to change, or a wrong type → `400`).

**Delete** (`DELETE /tasks/:id`). Removes the task and replies `204` with an empty body
(unknown id → `404`).

**Why `nextId` is a counter, not `tasks.length + 1`.** If you delete a task, the length
drops, and `length + 1` would eventually hand out an id that already belonged to a task
someone still has a link to. A counter that only ever goes up avoids reusing ids.

---

## 5. Seeing it without curl: Swagger UI

Typing `curl` commands is fine, but there is a nicer way to see an API. **Swagger UI**
is a web page that reads a description of your API — a standard file called
[`openapi.json`](openapi.json) — and turns it into interactive documentation. Every
endpoint is listed, each with a **Try it out** button that fires a real request.

It is, quite literally, `curl` with a friendly face. Open
<http://localhost:3000/docs> with the server running and you can run the whole
create → read → update → delete cycle by clicking.

Writing the `openapi.json` to describe endpoints you already built teaches you more
than building them did: it forces you to state, precisely, what each door expects and
what it returns.

---

## 6. Why in-memory, when it obviously loses the data?

Because the loss is the point. Keeping the store as an array makes the code tiny and
keeps all the attention on the API shape — the paths, methods, and status codes — which
is what this assignment is about.

Then, when the data evaporates on the next restart, you _feel_ the problem that
databases exist to solve. [Assignment 05](../../week-03/assignment-05/) swaps the array
for SQLite and the tasks start surviving restarts — and, crucially, **not one endpoint
changes.** Same paths, same methods, same responses. That "the storage changed but the
API didn't" is one of the biggest ideas in backend engineering, and you can only
appreciate it once you have lived on both sides of it.

---

## 7. How it was verified

Not "it looks right" — it was actually exercised end to end:

- Started the server, saw `Task API running at http://localhost:3000`.
- `GET /tasks` → `200`, the three seed tasks.
- `POST /tasks` with `{"title":"Buy milk"}` → `201`, a task with a new id and
  `done:false`; a follow-up `GET /tasks` showed it in the list.
- `POST /tasks` with `{}` → `400`.
- `PUT /tasks/4` with `{"done":true}` → `200`, the task flipped to done.
- `DELETE /tasks/4` → `204`; a follow-up `GET /tasks/4` → `404`.
- `GET /tasks/99` → `404` `{"error":"Task 99 not found"}`.
- Opened `/docs` and ran the full cycle from Swagger's "Try it out".

---

## 8. Where to go next

- **[Assignment 05](../../week-03/assignment-05/)** is the direct sequel: the same CRUD
  API, but backed by SQLite so the data persists. Diff the two `server.js` files and
  notice how little the routes change.
- Try `curl -i` on every endpoint and read the raw status line — it is the same
  information Swagger shows you, one layer down.
