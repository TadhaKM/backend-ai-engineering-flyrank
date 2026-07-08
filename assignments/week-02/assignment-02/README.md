# Assignment 02 — Authentication Backend

> **Status:** 🟢 Complete — every endpoint and status code verified end-to-end (including expired and tampered tokens).

A minimal but complete authentication backend: register a user, hash their password,
log them in, hand them a JWT, and use that token to guard a protected route.

Users are kept in an **in-memory array** — no database yet. Everything disappears when
the server restarts. That's deliberate: it keeps the focus on authentication.

---

## Contents

- [Endpoints](#endpoints)
- [Project structure](#project-structure)
- [Dependencies](#dependencies)
- [Setup](#1-setup)
- [Why secrets belong in environment variables](#why-secrets-belong-in-environment-variables)
- [Run it](#2-run-it)
- [Testing with curl](#3-testing-with-curl)
- [Testing with Postman or Insomnia](#testing-with-postman-or-insomnia)
- [HTTP status codes](#4-http-status-codes)
- [Security best practices](#5-security-best-practices)
- [Request → response flow](#6-request--response-flow)
- [What's deliberately missing](#whats-deliberately-missing)

---

## Endpoints

| Method | Path        | Auth required | Purpose                           |
| ------ | ----------- | ------------- | --------------------------------- |
| `GET`  | `/`         | no            | Public route — anyone can call it |
| `POST` | `/register` | no            | Create an account                 |
| `POST` | `/login`    | no            | Exchange credentials for a JWT    |
| `GET`  | `/profile`  | **yes**       | Protected — needs a valid token   |

---

## Project structure

```text
assignment-02/
├── server.js            # entry point: config, app setup, routes, listen
├── routes/
│   └── auth.js          # POST /register and POST /login + the in-memory user array
├── middleware/
│   └── auth.js          # the JWT gatekeeper that protects routes
├── .env                 # YOUR real secret — git-ignored, never committed
├── .env.example         # documents WHICH variables exist, not their values
├── .gitignore           # node_modules + .env
├── package.json         # dependencies and the `npm start` script
└── README.md            # this file
```

**Why split it up?** Each file has one job. `server.js` wires things together and stays
short. `routes/auth.js` owns "who are our users". `middleware/auth.js` owns "is this
request allowed". You can read any one of them without holding the others in your head —
and when the app grows, you add a file rather than growing one giant one.

---

## Dependencies

| Package        | What it does                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `express`      | The web framework — routing, `req`/`res`, middleware.                                                  |
| `bcrypt`       | Hashes passwords. Deliberately slow, and salts every hash. See [security](#5-security-best-practices). |
| `jsonwebtoken` | Creates (`jwt.sign`) and verifies (`jwt.verify`) the signed login token.                               |
| `dotenv`       | Reads the `.env` file into `process.env` so secrets stay out of the code.                              |

> The brief listed `uuid` as optional. We don't need it — Node has `crypto.randomUUID()`
> built in, so that's one fewer dependency to install, audit, and keep updated.

---

## 1. Setup

From this folder:

```bash
npm install          # downloads express, bcrypt, jsonwebtoken, dotenv
cp .env.example .env # create your local config
```

Then open `.env` and set a real secret. Generate a long random one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```env
JWT_SECRET=<paste the long random string here>
PORT=3000
```

The server **refuses to start** without `JWT_SECRET`. That's on purpose: booting without
a secret would mean signing tokens with `undefined`, and anyone could forge a login.
Failing loudly at startup beats failing silently in production.

### Why secrets belong in environment variables

Not in the source code, ever. Because:

- **Code gets shared.** It's pushed to GitHub, copied to a laptop, pasted into a chat.
  A secret in the code goes everywhere the code goes.
- **Git never forgets.** A committed secret stays in the repository history _forever_,
  even after you delete the line. Rotating it is the only real fix.
- **Different environments need different values.** Your laptop, staging, and production
  should each have their own secret. Same code, different `.env`.
- **Rotation shouldn't need a deploy.** If a secret leaks, you change one env var and
  restart — you don't edit and re-release the code.

That's why `.env` is in `.gitignore`, and only `.env.example` (names, no values) is
committed.

---

## 2. Run it

```bash
node server.js
# Server running at http://localhost:3000
```

`npm start` does the same thing. Stop with **Ctrl+C**.

---

## 3. Testing with curl

Open a second terminal — the first one is busy running the server.

### Public route

```bash
curl http://localhost:3000/
# {"message":"Public route — anyone can see this."}
```

### Register

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'
# 201 -> {"id":"ab9af27f-...","username":"alice"}
```

Note what comes back: an id and a username. **Never** the password, never the hash.

Try it a second time with the same username:

```bash
# 409 -> {"error":"username already exists"}
```

And with bad input:

```bash
curl -X POST http://localhost:3000/register -H "Content-Type: application/json" \
  -d '{"username":"carol"}'
# 400 -> {"error":"username and password are required"}
```

### Login

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'
# 200 -> {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."}
```

Wrong password (or a username that doesn't exist) gives the _same_ vague error:

```bash
# 401 -> {"error":"Invalid username or password"}
```

That vagueness is intentional — see [security](#5-security-best-practices).

### Protected route

Copy the token from the login response:

```bash
TOKEN="paste-the-token-here"

curl http://localhost:3000/profile -H "Authorization: Bearer $TOKEN"
# 200 -> {"message":"You are authenticated!","user":{"username":"alice"}}
```

Now try it without a token, and with a broken one:

```bash
curl http://localhost:3000/profile
# 401 -> {"error":"Missing Authorization header"}

curl http://localhost:3000/profile -H "Authorization: Bearer not.a.real.token"
# 403 -> {"error":"Invalid or expired token"}
```

### Testing with Postman or Insomnia

Same requests, with a UI instead of a terminal:

1. **New request** → set the method (`POST`) and URL (`http://localhost:3000/register`).
2. **Body tab** → choose **raw** → pick **JSON** from the dropdown → paste:
   ```json
   { "username": "alice", "password": "password123" }
   ```
   Selecting JSON matters: it sets the `Content-Type: application/json` header, which is
   how Express knows to parse the body.
3. **Send.** You should see `201 Created` and the JSON response.
4. For `/login`, repeat and **copy the `token`** from the response.
5. For `/profile` (a `GET`), open the **Authorization tab** → type **Bearer Token** →
   paste the token. (Equivalently: **Headers tab** → add
   `Authorization` = `Bearer <token>`.)
6. **Send.** You should see `200 OK` and your profile.

> Tip: paste a token into <https://jwt.io> to see its contents. You'll be able to read
> the payload without knowing the secret — which is exactly why nothing sensitive goes
> in there.

---

## 4. HTTP status codes

The status code is the _first_ thing a client reads. Using the right one means a client
can react correctly without parsing your error message.

| Code                        | When we send it                         | Why that code                                                                 |
| --------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| `200 OK`                    | login succeeded, profile returned       | The generic "here's what you asked for".                                      |
| `201 Created`               | registration succeeded                  | More precise than 200: a **new resource now exists** that didn't before.      |
| `400 Bad Request`           | missing field, short password, bad JSON | The request itself is malformed. Retrying it unchanged will fail again.       |
| `401 Unauthorized`          | no token; bad username/password         | "I don't know who you are." The client should authenticate and retry.         |
| `403 Forbidden`             | token present but invalid or expired    | "I know who you claim to be — the answer is still no." Re-sending won't help. |
| `409 Conflict`              | username already taken                  | The input is _valid_, but it clashes with state that already exists.          |
| `500 Internal Server Error` | an unexpected crash                     | Our fault, not the client's. Never leak the stack trace.                      |

**401 vs 403 is the one people get wrong.** The rule of thumb used here:

- **401** — you sent _no_ usable credentials. Go get some and try again.
- **403** — you sent credentials, but they don't grant access. Trying again won't help.

(Confusingly, HTTP's `401` is _named_ "Unauthorized" but really means "unauthenticated".
Don't fight it; just be consistent.)

---

## 5. Security best practices

### Why passwords must be hashed

Databases leak. Backups get copied to laptops, an SQL injection dumps a table, a
misconfigured bucket goes public. If the leaked table holds plain passwords, every
account is instantly compromised — and because people reuse passwords, so are their
email, bank, and everything else. If it holds hashes, the attacker has to _crack_ each
one, which is slow and often not worth it.

Hashing is **one-way**: `password123` → `$2b$10$N9qo8uLOickgx2...`. There's no function
that turns it back. To check a login, we hash what the user just typed and compare the
two hashes. We never need the original.

### Why bcrypt, and not "encrypt the passwords"

Encryption is **two-way**: encrypt with a key, decrypt with the same key. That means the
plaintext passwords are always one leaked key away from being exposed. Storing
recoverable passwords is a design mistake — you never need to recover them.

But not all hashing is equal. `SHA-256` is a hash, and it's a _terrible_ password hash,
because it's **fast**: a GPU can compute billions per second and brute-force short
passwords in minutes. bcrypt is built to be **deliberately slow** and gives you two
defences:

- **Cost factor** (we use `10`): each hash takes ~50–100ms. Barely noticeable when you
  log in once; ruinous for an attacker trying billions of guesses. Raise it as hardware
  gets faster.
- **A random salt per password**, stored inside the hash string itself. So two users with
  the same password get _different_ hashes. This kills **rainbow tables** (giant
  precomputed hash→password lookups) and means cracking one hash tells you nothing about
  the next.

### Why JWTs should expire

A JWT is a **bearer token**: whoever holds it _is_ you, no questions asked. If one leaks
— from a log file, browser storage, a shared screen — the thief has your account.

The catch is that JWTs are **stateless**: the server doesn't store them, it just checks
the signature. So there's no list to delete a stolen token from. Expiry is the safety
net: `expiresIn: '1h'` means a stolen token is worthless after an hour. Short-lived
tokens (paired with refresh tokens in a real app) limit the blast radius.

### Why secrets must never be committed to Git

`git commit` writes to history, and history is permanent. Deleting the line in a later
commit does **not** remove it — anyone who clones the repo can `git log` it back. And if
the repo is ever made public, or a laptop is stolen, or a contractor keeps a clone, the
secret is out.

With `JWT_SECRET` specifically: anyone who has it can **forge a token for any user**.
They don't need a password. They just sign `{"sub":"...","username":"admin"}` themselves
and your server happily accepts it. If a secret is ever committed, rotating it is the
only real remedy.

### Why HTTPS matters in production

Everything here travels as **plain text over the network**: the password in the
`/register` body, and the token in the `Authorization` header on every subsequent
request. Without HTTPS, anyone between the client and the server — the coffee-shop wifi,
an ISP, a compromised router — can simply read both.

HTTPS encrypts the connection, so the request is unreadable in transit. It also proves
the server is who it says it is, preventing an attacker from impersonating your API and
harvesting passwords. Hashing protects the _database_; HTTPS protects the _wire_. You
need both.

### Why plain text passwords are dangerous

Beyond the leak scenario above: a plain password is exposed to everything that touches
it. It ends up in **logs** when someone debug-prints the request body, in **error
trackers**, in **database backups** shared with a vendor, and visible to any employee who
can run a `SELECT`. Hashing at the moment of receipt means that even _you_ never hold
your users' passwords — which is exactly the position you want to be in.

> **One more, applied here:** `/login` returns the same `401 Invalid username or password`
> whether the username doesn't exist or the password was wrong. Different messages would
> let an attacker enumerate which usernames are registered. We also always run a bcrypt
> comparison — against a dummy hash if the user doesn't exist — so the _response time_
> doesn't leak that answer either.

---

## 6. Request → response flow

### 1. Registration

The client sends a username and password. Express parses the JSON body. We validate it,
check nobody has that username, hash the password with bcrypt, and push the user into
the array. The plain password is discarded — it never leaves the request handler.

```text
Client  ──POST /register {username, password}──▶  Express
                                                     │  express.json() parses the body
                                                     │  validate  → 400 if bad
                                                     │  duplicate? → 409
                                                     │  bcrypt.hash(password, 10)
                                                     │  users.push({id, username, hash})
Client  ◀────────── 201 {id, username} ──────────────┘
```

### 2. Login

We find the user, and let bcrypt re-hash the submitted password and compare it to the
stored hash. On success we sign a JWT — a string containing the user's id and username,
plus an expiry, all signed with `JWT_SECRET`. The client stores it and sends it back on
every future request.

### 3. Accessing a protected endpoint

The client sends `Authorization: Bearer <jwt>`. Our middleware runs _before_ the route
handler. It verifies the signature (proving we issued the token and nobody edited it) and
the expiry. If that passes, it attaches the user to `req.user` and calls `next()`, which
finally runs the route handler. If not, it replies 401 or 403 and the handler never runs.

```text
Client
   │
POST /login
   │
   ▼
Express
   │
Check username
   │
Compare password with bcrypt
   │
Generate JWT
   │
Return token
   ▼
Client stores token

Later...

Client
   │
GET /profile
Authorization: Bearer JWT
   │
   ▼
Authentication middleware
   │
Verify JWT
   │
Attach user to req.user
   │
Call next()
   ▼
Protected route
   │
Return profile JSON
```

---

## What's deliberately missing

Kept out to stay focused — each is what you'd add next:

- **A real database.** `users` is an array; it resets on restart.
- **Refresh tokens.** With a 1h expiry the user must log in again. Real apps issue a
  short-lived access token plus a long-lived refresh token.
- **Logout / revocation.** Stateless JWTs can't be un-issued. You'd keep a denylist, or
  keep sessions server-side.
- **Rate limiting.** Nothing stops an attacker trying thousands of passwords against
  `/login`.
- **HTTPS.** Handled by a reverse proxy or the hosting platform in production, not here.
