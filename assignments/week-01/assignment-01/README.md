# Assignment 01 — Your first CRUD API

> **Status:** 🟢 Complete — full CRUD cycle verified with `curl` and Swagger UI.

A small **CRUD** API that manages a to-do list: create tasks, read them, update them,
and delete them. Data lives in memory (a plain array), so it resets when the server
restarts — that limitation is the whole setup for [assignment-05](../../week-03/assignment-05/),
which keeps these exact endpoints and swaps the array for a real SQLite database.

**CRUD → HTTP:**

| CRUD operation | HTTP method | Endpoint            | Meaning         |
| -------------- | ----------- | ------------------- | --------------- |
| Create         | `POST`      | `POST /tasks`       | Add a new task  |
| Read           | `GET`       | `GET /tasks`        | List every task |
| Read (one)     | `GET`       | `GET /tasks/:id`    | Get one task    |
| Update         | `PUT`       | `PUT /tasks/:id`    | Change a task   |
| Delete         | `DELETE`    | `DELETE /tasks/:id` | Remove a task   |

---

## Endpoints

| Method & path       | Body                      | Success               | Errors                 |
| ------------------- | ------------------------- | --------------------- | ---------------------- |
| `GET /`             | —                         | `200` API info        | —                      |
| `GET /health`       | —                         | `200` `{status:"ok"}` | —                      |
| `GET /tasks`        | —                         | `200` array           | —                      |
| `GET /tasks/:id`    | —                         | `200` task            | `404` not found        |
| `POST /tasks`       | `{ "title": "Buy milk" }` | `201` task            | `400` missing title    |
| `PUT /tasks/:id`    | `{ "title"?, "done"? }`   | `200` task            | `400` bad body · `404` |
| `DELETE /tasks/:id` | —                         | `204` empty           | `404` not found        |

A task is `{ "id": number, "title": string, "done": boolean }`.

---

## Run it

```bash
npm install                 # from the repo root, once
npm start --workspace @flyrank/assignment-01
```

You should see:

```text
Task API running at http://localhost:3000  (interactive docs: /docs)
```

Stop it with **Ctrl+C**. (`npm install` at the repo root already covers this workspace.)

---

## Try it — `curl`

```bash
# List the seed tasks
curl -i http://localhost:3000/tasks

# Create one
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk"}'

# Mark it done (use the id you got back)
curl -i -X PUT http://localhost:3000/tasks/4 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

# Delete it
curl -i -X DELETE http://localhost:3000/tasks/4
```

Example response for `POST /tasks` (the pasted output the brief asks for):

```text
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{"id":4,"title":"Buy milk","done":false}
```

Asking for something that isn't there returns a `404`, not an empty `200`:

```text
$ curl -i http://localhost:3000/tasks/99
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"error":"Task 99 not found"}
```

---

## See it — Swagger UI

With the server running, open **<http://localhost:3000/docs>**.

Every endpoint is listed with a **Try it out** button that sends real requests — no
`curl` needed. The page is generated from [`openapi.json`](openapi.json).

> 📸 **Screenshot for your submission:** open `/docs`, expand `POST /tasks`, run
> "Try it out", and screenshot the result. Save it as `docs-screenshot.png` in this
> folder and it will show up here:
>
> `![Swagger UI](docs-screenshot.png)`

---

## Project structure

```text
assignment-01/
├── server.js       # the entire API — routes + in-memory store + Swagger wiring
├── openapi.json    # the API description Swagger UI renders
├── package.json    # express + swagger-ui-express
└── .gitignore      # keeps node_modules out of git
```

---

## Notes & limitations

- **Data is in memory.** Restarting the server resets the list to the three seed tasks.
  That is deliberate — [assignment-05](../../week-03/assignment-05/) fixes it with SQLite
  while keeping every endpoint identical.
- **Ids never repeat.** A counter hands out the next id, so deleting task 4 does not free
  up `4` for the next `POST`.
- **Port 3000 is hard-coded.** Only one assignment can use 3000 at a time; see the repo
  root's `npm run dev:all` for how the servers run side by side.
