# Assignment 03 — Postgres in Docker

> **Status:** 🟢 Complete — code verified end-to-end against a real Postgres engine.
> **The `docker compose up` step is unverified: Docker is not installed on this machine.** See [Verification: what was actually run](#verification-what-was-actually-run).

Assignment 02's auth service, with the in-memory user array replaced by a real
Postgres database running in Docker, with a volume so the data survives restarts.

The point isn't the database. The point is that **swapping storage touched no route,
no handler, and no middleware** — because a repository interface sits between them.

---

## Contents

- [Project structure](#project-structure)
- [The repository seam](#the-repository-seam-the-actual-point)
- [Did the routes really not change? (honestly)](#did-the-routes-really-not-change-honestly)
- [Quick start](#quick-start)
- [Proving persistence](#proving-persistence)
- [Verification: what was actually run](#verification-what-was-actually-run)
- [How the pieces work](#how-the-pieces-work)
- [Stretch: Redis](#stretch-redis)
- [Stretch: an index and EXPLAIN ANALYZE](#stretch-an-index-and-explain-analyze)
- [Troubleshooting](#troubleshooting)

---

## Project structure

```text
assignment-03/
├── docker-compose.yml    # app + postgres + redis, one command
├── Dockerfile            # how the app image is built
├── .dockerignore
├── db/
│   └── init.sql          # the whole schema — ONE file, used by Docker AND the app
├── repositories/
│   ├── userRepository.js         # THE CONTRACT (no storage code at all)
│   ├── inMemoryUserRepository.js # A2's array, behind the contract
│   ├── postgresUserRepository.js # the same contract, backed by SQL
│   └── index.js                  # THE SWAP POINT — picks one, based on $STORAGE
├── routes/auth.js        # POST /register, POST /login  (talks only to the contract)
├── middleware/auth.js    # JWT gatekeeper — byte-for-byte identical to A2
├── server.js             # builds the repository, injects it, listens
├── .env / .env.example
└── package.json
```

---

## The repository seam (the actual point)

```text
routes/auth.js  ──depends on──▶  UserRepository (an interface)
                                        ▲            ▲
                                        │            │
                     inMemoryUserRepository    postgresUserRepository
                          (an array)                (SQL)
```

`routes/auth.js` calls `users.findByUsername(...)` and `users.create(...)`. It cannot
tell whether the answer came from an array or a `SELECT`, and it does not care. That
ignorance is what makes the swap free.

**Switching storage is one environment variable:**

```bash
STORAGE=memory   node server.js   # no database needed
STORAGE=postgres node server.js   # talks to Postgres
```

Both were run against the same test suite. Identical results (see below).

`repositories/index.js` is the only file in the project that knows both backends exist.

### Why the contract is `async`

Every method returns a Promise, even in the in-memory version where nothing awaits.
If the contract were synchronous, adding a database later would break every caller —
you can't `await` something that was designed to return a value immediately. The
in-memory version pays a tiny cost so that the Postgres version can exist at all.

### Why the repository maps column names

Postgres columns are `password_hash`; the app speaks `passwordHash`. The translation
happens inside `postgresUserRepository.js`. If it leaked out, every route would need to
know the database's naming convention — and changing a column would ripple everywhere.

---

## Did the routes really not change? (honestly)

The brief says to say this honestly, so:

**No — `routes/auth.js` did change from A2 to A3, and it had to.** A2 had _no seam_.
Its route file owned the array directly:

|                         | A2 `routes/auth.js`                            | A3 `routes/auth.js`                        |
| ----------------------- | ---------------------------------------------- | ------------------------------------------ |
| owns `const users = []` | **yes**                                        | no                                         |
| calls                   | `users.find()`, `users.push()`, `users.some()` | `users.findByUsername()`, `users.create()` |
| gets storage from       | itself                                         | injected by `server.js`                    |

That's ~86 lines of changed code — a one-time refactor to _create_ the seam.
`middleware/auth.js` is byte-for-byte identical (`cmp` confirms it).

**The claim that actually holds is the important one:** once the seam exists,
switching between the array and Postgres changes **zero lines of application code**.
Only `$STORAGE` changes. That was verified by running the same endpoint suite against
both backends and getting identical status codes.

So the architecture _did_ pay off — just one refactor later than the phrasing implies.

---

## Quick start

```bash
cp .env.example .env
# then edit .env: set JWT_SECRET and POSTGRES_PASSWORD
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

docker compose up          # builds the app, starts postgres + redis + app
```

Then, in another terminal:

```bash
curl localhost:3000/health
# {"status":"ok","storage":"postgres","users":0,"redis":"PONG"}

curl -X POST localhost:3000/register -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'          # 201

TOKEN=$(curl -s -X POST localhost:3000/login -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}' | jq -r .token)

curl localhost:3000/profile -H "Authorization: Bearer $TOKEN"  # 200
```

To run **without** Docker at all:

```bash
STORAGE=memory node server.js
```

---

## Proving persistence

Data that survives a restart is the whole reason to run a database.

```bash
# 1. create a row
docker compose up -d
curl -X POST localhost:3000/register -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'
curl localhost:3000/health          # -> "users": 1

# 2. destroy the containers (both the app AND the database)
docker compose down                 # note: NO -v

# 3. bring it all back
docker compose up -d
curl localhost:3000/health          # -> "users": 1   <-- still there
curl -X POST localhost:3000/login -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'   # -> 200, the bcrypt hash persisted
```

**Why it survives:** `docker-compose.yml` mounts a _named volume_ at Postgres' data
directory:

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
```

The container is disposable; the volume is not. `docker compose down` deletes the
containers and keeps the volume.

**To actually reset**, you must delete the volume:

```bash
docker compose down -v     # -v = also remove named volumes. Data is gone.
```

That distinction — `down` vs `down -v` — is the single most useful thing on this page.

---

## Verification: what was actually run

Docker is **not installed** on the machine this was written on, so `docker compose up`
was never executed here. Rather than ship untested SQL, the repository was exercised
against a real Postgres engine another way, and everything else was run for real.

### ✅ Verified (actually executed)

| What                                      | How                                                                                                                                                            | Result                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Every endpoint on `STORAGE=memory`        | ran `server.js`, curl'd all routes                                                                                                                             | 201 / 409 / 400 / 200 / 401 / 403 all correct                  |
| Every endpoint on `STORAGE=postgres`      | ran the **unmodified `server.js`** with the real `pg` driver, over the real Postgres wire protocol, against **PostgreSQL 18.3** ([PGlite](https://pglite.dev)) | identical results — **zero code changed between the two runs** |
| `db/init.sql`                             | executed by `postgresUserRepository.init()` against real Postgres                                                                                              | table created; `init()` is idempotent                          |
| Duplicate username                        | real `INSERT` violating the `UNIQUE` constraint                                                                                                                | Postgres error `23505` → `DuplicateUsernameError` → HTTP `409` |
| SQL injection                             | `findByUsername("'; DROP TABLE users; --")`                                                                                                                    | treated as literal text; table intact (bound parameter `$1`)   |
| Contract equality                         | runtime assertion over both backends                                                                                                                           | both implement all five methods                                |
| **Persistence across an app restart**     | killed the app process, started a new one against the same database                                                                                            | `users: 2`, old bcrypt hash still validates a login            |
| **Persistence across a database restart** | killed the _database_ process, restarted it on the same data directory                                                                                         | rows `alice, bob` still present                                |
| `docker-compose.yml`                      | parsed and structurally asserted (volume, init mount, healthcheck, `depends_on: service_healthy`, `@db:5432` host)                                             | valid                                                          |

A bug was found this way: `init()` originally stripped any statement whose chunk began
with `--`, which silently discarded the whole `CREATE TABLE` because `init.sql` opens
with a comment block. It now strips comments _before_ splitting. That bug would have
survived any amount of code review.

### ❌ Not verified (needs Docker on your machine)

- `docker build` actually succeeding (in particular, `bcrypt` compiling in the image).
- `docker compose up` bringing up all three services and the healthcheck gating.
- Persistence across a **container** restart specifically, and the `down` vs `down -v`
  behaviour of the named volume.
- The Redis `PONG` in `/health` (the code path is guarded and untested).

The database layer is proven; the container layer is not. Run the commands in
[Proving persistence](#proving-persistence) to close that gap.

---

## How the pieces work

### `docker compose up`

Three services start:

- **`db`** — Postgres 16. Its data lives in the named volume `pgdata`, and `db/init.sql`
  is mounted into `/docker-entrypoint-initdb.d/`, which Postgres runs automatically the
  **first time** it initialises an empty volume.
- **`redis`** — not used by auth; wired up ready for Week 4.
- **`app`** — built from the `Dockerfile`. It waits for `db` to be _healthy_, not merely
  started.

### Why `depends_on: condition: service_healthy` matters

`depends_on` alone only waits for the container to _start_. Postgres takes a second or
two after that before it accepts connections. Without the healthcheck, the app races
Postgres' startup, fails its first connection, and crashes. The healthcheck runs
`pg_isready` until the database genuinely answers.

### Why `DATABASE_URL` is overridden in compose

Inside the compose network, containers reach each other by **service name**, so the
database is at `db:5432` — not `localhost`. `localhost` inside the app container means
_the app container itself_. `.env` holds a `localhost` URL for when you run the app on
your host; `docker-compose.yml` overrides it with `@db:5432` for the containerised case.

### Why one `init.sql`, used twice

Docker's init hook only fires on a brand-new volume. The app also runs the same file at
startup (every statement is `IF NOT EXISTS`), so the table exists even if you point at
a database Docker didn't create. One file, no drift. A real project would use a
migration tool instead.

### Why bound parameters (`$1`), always

```js
db.query('SELECT ... WHERE username = $1', [username]); // correct
db.query(`SELECT ... WHERE username = '${username}'`); // SQL injection
```

With `$1`, the query text and the value travel to the database separately, so a username
of `'; DROP TABLE users; --` is only ever compared as _text_. This is tested.

### Why the app closes its pool on shutdown

`server.js` handles `SIGINT`/`SIGTERM` and calls `pool.end()`. `docker compose down`
sends `SIGTERM`. Without this, Postgres keeps the dead connections until they time out.

---

## Stretch: Redis

Added to `docker-compose.yml` and pinged from `GET /health` when `REDIS_URL` is set:

```json
{ "status": "ok", "storage": "postgres", "users": 1, "redis": "PONG" }
```

The `redis` import is lazy (`await import('redis')` inside the handler), so the app runs
normally when `REDIS_URL` is unset — which is how the host-mode `.env` ships. Nothing in
auth depends on it yet; it's staged for Week 4 caching.

> Honest note: this path is **untested** — verifying it needs Redis running, which needs
> Docker.

---

## Stretch: an index and `EXPLAIN ANALYZE`

`username TEXT NOT NULL UNIQUE` — that `UNIQUE` quietly creates an index. To show what
it buys, 20,000 users were seeded, the constraint dropped, and the same lookup measured
before and after (real numbers, real Postgres 18.3):

```sql
EXPLAIN ANALYZE SELECT id FROM users WHERE username = 'user17777';
```

|                       | Plan                                                             | Execution time |
| --------------------- | ---------------------------------------------------------------- | -------------- |
| **Without** the index | `Seq Scan on users (cost=0.00..313.12 rows=58)`                  | **5.517 ms**   |
| **With** the index    | `Index Scan using users_username_key on users (cost=0.29..8.30)` | **0.436 ms**   |

**~12.6× faster.** A sequential scan reads every one of the 20,000 rows; the index scan
walks a B-tree and touches a handful. The gap widens with row count — this is the
difference between a login that stays fast at a million users and one that doesn't.

Note the `cost` estimate too: `313.12` vs `8.30`. That's the planner _predicting_ the
difference before running anything, which is how it decides which plan to use.

---

## Troubleshooting

**`Could not start: ECONNREFUSED`** — `STORAGE=postgres` but nothing is listening. Start
the database (`docker compose up -d db`) or run `STORAGE=memory node server.js`. The app
refuses to boot rather than start up and serve 500s.

**Changed `db/init.sql` but the table didn't change** — the Docker init hook only runs on
a _fresh_ volume. Either `docker compose down -v` (destroys data) or apply the change by
hand with `psql`.

**`docker compose up` builds slowly the first time** — `bcrypt` is a native addon and may
compile from source. The `Dockerfile` installs a toolchain in a build stage and leaves it
behind, so the final image stays small.
