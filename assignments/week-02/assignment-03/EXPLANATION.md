# Assignment 03 — Explanation

> **What this file is:** a plain-English walkthrough of what was built and _why_.
>
> **How it differs from [`README.md`](README.md):** the README tells you how to run the
> stack and prove persistence. This file explains the architecture, the trade-offs, the
> bug I hit, and how I verified things without Docker.

---

## 1. What the task was

Take Assignment 02's auth service and replace the in-memory `users` array with a **real
Postgres database running in Docker**, so that data survives a restart. Start the whole
thing — app _and_ database — with one command.

But the real lesson is hidden in the brief's phrasing: _"your service and routes must not
change — that's the architecture proving itself."_

---

## 2. Why "data survives a restart" is the whole point

In A2, `users` was an array in the Node process's memory. Stop the server, and every
account ever created is gone. That's fine for learning, and useless for anything else.

A **database** is a separate program whose entire job is to write your data to disk in a
way that survives crashes, power cuts, and restarts. Your app talks to it over a network
connection, the same way a browser talks to your app.

Once data outlives the process, your project stops being a demo.

---

## 3. The repository pattern (the actual point)

### The problem

In A2, `routes/auth.js` did this:

```js
const users = []; // it OWNED the storage
users.find((u) => u.username === username); // and knew it was an array
users.push(user);
```

Every route knew storage was an array. To swap in Postgres, you'd have to open every
route file and rewrite it. And when you later move to a different database, you'd do it
again.

### The fix: put an interface in the middle

```text
routes/auth.js  ──depends on──▶  UserRepository (an interface)
                                        ▲                ▲
                                        │                │
                     inMemoryUserRepository      postgresUserRepository
                          (an array)                    (SQL)
```

`repositories/userRepository.js` contains **no storage code at all**. It just declares
what any storage backend must be able to do:

```
init()                 prepare storage
findByUsername(name)   -> a User, or null
create(user)           -> the User  (throws DuplicateUsernameError)
count()                -> a number
close()                release connections
```

Now `routes/auth.js` calls `users.findByUsername(...)`. It _cannot tell_ whether the
answer came from an array or a `SELECT`. **That ignorance is what makes the swap free.**

This idea has a formal name — **dependency inversion**. The important half in plain
English: _the code that matters (your business logic) should not depend on the code that
happens to be replaceable (your database)._ Point both at an interface in the middle.

### The payoff, made literal

`repositories/index.js` is the **only file in the project** that knows both backends
exist. Switching storage is one environment variable:

```bash
STORAGE=memory   node server.js   # no database needed at all
STORAGE=postgres node server.js   # talks to Postgres
```

I ran the identical endpoint test suite against both. Identical results. **Zero lines of
application code changed between those two runs.**

---

## 4. Did the routes really not change? (the honest answer)

**No. `routes/auth.js` did change, and it had to.**

A2 had no seam to swap behind — the route file owned the array. So this assignment
required a **one-time refactor to create the seam** (~86 lines of changed code in
`routes/auth.js`).

|                         | A2 `routes/auth.js`                            | A3 `routes/auth.js`                        |
| ----------------------- | ---------------------------------------------- | ------------------------------------------ |
| owns `const users = []` | **yes**                                        | no                                         |
| calls                   | `users.find()`, `users.push()`, `users.some()` | `users.findByUsername()`, `users.create()` |
| gets storage from       | itself                                         | injected by `server.js`                    |

`middleware/auth.js` is **byte-for-byte identical** to A2 (verified with `cmp`) — it was
already independent of storage, so it never had to move.

**The claim that genuinely holds** is the more important one: _once the seam exists_,
swapping the array for Postgres changes **zero** application code. The architecture did
prove itself — just one refactor later than the phrasing implies. Worth being precise
about, because "we didn't change anything" is the kind of claim that quietly becomes
false and nobody notices.

---

## 5. Design decisions worth defending

### Why the interface is `async` even for the array

Every method returns a Promise, even in the in-memory version where nothing waits for
anything. That looks like pointless ceremony. It isn't.

A database call **must** be asynchronous — it crosses a network. If the interface were
synchronous (`findByUsername` returning a `User` directly), then adding a database later
would break **every single caller**, because you can't `await` something designed to
return instantly.

The in-memory version pays a tiny cosmetic cost so the Postgres version can exist at all.
**Design the interface for the hardest implementation, not the easiest.**

### Why the repository translates column names

Postgres columns are `password_hash` (SQL convention: snake_case). JavaScript says
`passwordHash` (camelCase). The translation happens **inside** `postgresUserRepository.js`:

```js
function toUser(row) {
  return { id: row.id, username: row.username, passwordHash: row.password_hash };
}
```

If that leaked out, every route would need to know your database's naming convention, and
renaming a column would ripple through the whole app. The repository's job is to be the
_only_ thing that speaks SQL.

### Why bound parameters (`$1`) — this one is not optional

```js
db.query('SELECT ... WHERE username = $1', [username]); // correct
db.query(`SELECT ... WHERE username = '${username}'`); // SQL INJECTION
```

With `$1`, the query text and the value travel to the database **separately**. Postgres
parses the query first, _then_ slots the value in as data. So a username of

```text
'; DROP TABLE users; --
```

is only ever compared as _text_. It can never be parsed as SQL. With string
concatenation, that username would end your database.

I tested this: `findByUsername("'; DROP TABLE users; --")` returned `null`, and the table
was still there afterwards.

### Why one `init.sql`, used in two places

The schema lives in exactly one file. Docker mounts it into
`/docker-entrypoint-initdb.d/`, which Postgres runs automatically the **first time** it
creates an empty data volume. The app _also_ runs it at startup (every statement is
`IF NOT EXISTS`, so it's harmless to repeat).

Why both? The Docker hook only fires on a brand-new volume. Running it from the app too
means the table exists even if you point at a database Docker didn't create. One file, no
chance of the two drifting apart. (A production project would use a proper _migration
tool_ instead — a versioned list of schema changes.)

---

## 6. The Docker parts, explained

### What Docker actually gives you

A **container** is an isolated, disposable copy of a program plus everything it needs to
run. `postgres:16-alpine` is an image someone else built; running it gives you a working
Postgres in seconds, with no installer and nothing polluting your machine.

`docker compose` runs _several_ containers together and puts them on a private network
where they can find each other **by service name**.

### The volume — the single most important line

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
```

Containers are **disposable**: delete one and everything inside it vanishes. That's the
point of them. So if Postgres writes its data inside the container, your data dies with
the container.

A **named volume** is storage that lives _outside_ the container and gets mounted into
it. The container is disposable; the volume is not.

This produces the single most useful fact on this page:

```bash
docker compose down      # deletes the containers, KEEPS the volume  -> data survives
docker compose down -v   # deletes the volume too                    -> data is GONE
```

If you ever wonder why your database "won't reset" after editing `init.sql` — that's why.
The init hook only runs on an empty volume.

### Why `localhost` doesn't work inside a container

```yaml
DATABASE_URL: postgres://user:pass@db:5432/authdb
#                                  ^^ the service name, not localhost
```

Inside the app's container, `localhost` means _the app container itself_. The database is
a **different** container. On Docker's private network, containers reach each other by
service name — so the database is at `db`.

That's why `.env` holds a `localhost` URL (for when you run the app directly on your
machine) and `docker-compose.yml` **overrides** it with `@db:5432` for the containerised
case.

### Why the healthcheck exists

```yaml
depends_on:
  db:
    condition: service_healthy
```

`depends_on` on its own only waits for the container to **start**. But Postgres takes a
second or two after starting before it will accept connections. Without the healthcheck,
the app races Postgres' boot, fails its first connection, and crashes.

The healthcheck runs `pg_isready` in a loop until the database genuinely answers. _Then_
the app starts. "Started" and "ready" are different things — a distinction that causes an
enormous amount of confusion in real deployments.

---

## 7. What went wrong (the bug)

This is the most valuable part of the assignment, so read it.

`init()` runs the schema file. Some Postgres clients only accept one statement per query,
so I split `init.sql` on `;` and ran each piece. I also filtered out comments:

```js
const statements = SCHEMA_SQL.split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith('--')); // <-- the bug
```

Looks reasonable. It is completely broken.

`init.sql` opens with a **comment block** explaining the file. Split on `;`, and the very
first chunk is:

```text
-- db/init.sql — the entire database schema.
-- ...twelve more comment lines...
CREATE TABLE IF NOT EXISTS users ( ... )
```

That chunk **starts with `--`**. So the filter threw the whole thing away — comments _and_
the `CREATE TABLE`. The table was never created. The very next query failed with
"relation `users` does not exist".

**The fix:** strip comments _first_, then split.

```js
const statements = SCHEMA_SQL.replace(/--[^\n]*/g, '').split(';')...
```

**Why this matters more than the bug itself:** this would have passed any amount of code
review. It reads correctly. The only thing that caught it was _running the SQL against a
real database_. If I'd shipped the Docker files untested, you'd have hit a baffling error
on `docker compose up` and had no idea why.

**Lesson: code you haven't executed is a guess.**

---

## 8. How it was verified without Docker

Docker isn't installed on this machine — no `docker` binary, nothing on port 5432, not
even Docker inside WSL. So `docker compose up` was never run here, and I won't pretend
otherwise.

But refusing to ship unrun SQL, I used **PGlite** — real PostgreSQL 18.3 compiled to
WebAssembly, running inside Node. It even has a **wire-protocol socket server**, meaning
the app's real `pg` driver connected to it over a real TCP socket, exactly as it would to
Postgres in Docker. The unmodified `server.js` never knew the difference.

The harness was installed **outside the repository**, so it never became a project
dependency.

### ✅ Actually executed

- Every endpoint on `STORAGE=memory` **and** on `STORAGE=postgres` — identical results,
  zero code changed between runs. (This is the proof of §3.)
- `db/init.sql` runs; `init()` is safe to call twice.
- Duplicate username → real `UNIQUE` violation → Postgres error code `23505` →
  `DuplicateUsernameError` → HTTP `409`.
- SQL injection attempt treated as literal text; table intact.
- **Persistence across an app restart** — killed the app, started a new process:
  `users: 2`, and the old bcrypt hash still validated a login.
- **Persistence across a database restart** — killed the _database_ process, restarted it
  on the same data directory: `alice, bob` still there.
- `docker-compose.yml` parsed and structurally checked (named volume, init mount,
  healthcheck, `service_healthy`, `@db:5432`).

### ❌ Not verified — needs Docker on your machine

- `docker build` succeeding (especially `bcrypt` compiling inside the image).
- `docker compose up` bringing up all three services.
- Persistence across a **container** restart specifically, and `down` vs `down -v`.
- The Redis `PONG` in `/health`.

**The database layer is proven. The container layer is not.** Run the recipe in the
README to close that gap.

---

## 9. The index, and why `EXPLAIN ANALYZE` matters

`username TEXT NOT NULL UNIQUE` — that `UNIQUE` quietly creates an **index** behind your
back. An index is a sorted lookup structure (a B-tree), like the index at the back of a
textbook: instead of reading every page to find a word, you jump straight to it.

To show what it's worth, I seeded 20,000 users, dropped the constraint, and measured the
same lookup before and after. Real numbers, real Postgres:

|                       | Plan                                  | Execution time |
| --------------------- | ------------------------------------- | -------------- |
| **Without** the index | `Seq Scan on users`                   | **5.517 ms**   |
| **With** the index    | `Index Scan using users_username_key` | **0.436 ms**   |

**~12.6× faster.** A _sequential scan_ reads all 20,000 rows. An _index scan_ walks the
tree and touches a handful.

And the gap **widens with row count** — that's the real lesson. At 20 users you'd never
notice. At a million, a sequential scan on every login is the difference between a working
product and a dead one.

Notice the planner's `cost` estimate too: `313.12` vs `8.30`. That's Postgres _predicting_
the difference before running anything — which is how it decides which plan to use.
`EXPLAIN ANALYZE` shows you both the prediction and the reality.

---

## 10. Small things worth noticing

**The app refuses to boot if the database is down.** It prints one clear sentence
(`The database refused the connection. Is it running?`) and exits, instead of starting up
and serving 500s to every request. Also: `AggregateError`, which `pg` throws on a refused
connection, has an _empty_ `.message` — so the error handler falls back to `err.code`.
Small detail, but it's the difference between a useful message and `Could not start: `.

**The app closes its connection pool on shutdown.** `docker compose down` sends `SIGTERM`;
we catch it and call `pool.end()`. Without that, Postgres holds dead connections until
they time out.

**A `Pool`, not a `Client`.** Opening a Postgres connection is expensive. A pool keeps a
few open and hands them out as needed.

**Redis is in the compose file but unused.** It's staged for Week 4 (caching). The
`/health` route pings it _only_ if `REDIS_URL` is set, and the import is lazy — so nothing
breaks when it's absent.

---

## 11. Where to go next

- Run `docker compose up`, create a user, run `docker compose down`, then `up` again.
  Watch the user still be there. Then run `down -v` and watch it vanish. That contrast is
  the entire assignment in 30 seconds.
- `psql` into the container and look at your data:
  `docker compose exec db psql -U authuser -d authdb -c 'SELECT id, username FROM users;'`
  You'll see the bcrypt hash sitting there — and no plain password anywhere.
- Try `EXPLAIN ANALYZE` on your own queries. Getting comfortable reading query plans is
  one of the highest-leverage backend skills there is.
