# Assignment 02 — Explanation

> **What this file is:** a plain-English walkthrough of what was built and _why_.
>
> **How it differs from [`README.md`](README.md):** the README is reference documentation
> — endpoints, curl commands, status codes. This file explains the reasoning, the traps,
> and the concepts.

---

## 1. What the task was

Take Assignment 01's server and give it **real user accounts**: sign up, log in, and a
page only logged-in users can see. No database yet — users live in an array.

---

## 2. The central problem: HTTP forgets you

Assignment 01 ended with a fact that seemed like trivia: **HTTP is stateless.** The
server answers your request and immediately forgets you existed.

That's now the entire problem. If the server forgets you the instant it replies, how
does it know, on your _next_ request, that you already logged in?

There are two classic answers:

1. **Sessions.** The server remembers you in its own memory and gives you a ticket
   number (a cookie). Every request, you show the ticket; the server looks you up.
   Simple, but the server has to store something for every logged-in user.
2. **Tokens (what we did).** The server gives you a _signed note_ that says "this is
   alice". You send the note back every time. The server doesn't remember anything —
   it just checks the signature is genuine.

The signed note is a **JWT** (JSON Web Token). We chose it because it's stateless: the
server keeps no session store. That has a cost we'll come back to in §7.

---

## 3. What was built

Three files, each with exactly one job.

### `routes/auth.js` — who our users are

Holds the `users` array and two endpoints:

- **`POST /register`** — validate the input, reject duplicate usernames, hash the
  password, save the user.
- **`POST /login`** — find the user, check the password, hand back a JWT.

### `middleware/auth.js` — is this request allowed?

**Middleware** is just a function that runs _before_ your route handler. It receives the
same `req` and `res`, plus a third thing: `next`, a function meaning _"I'm done, carry
on."_

```js
app.get('/profile', authenticateToken, (req, res) => { ... });
//                  └── runs first ──┘  └── only runs if next() was called ──┘
```

If the middleware replies (`res.status(401).json(...)`) and never calls `next()`, the
route handler simply never executes. That's the whole mechanism. A gate.

### `server.js` — wiring

Loads config, creates the app, attaches the public route, the auth routes, and the
protected route. Stays short on purpose.

---

## 4. Why passwords are hashed (and what that even means)

### Hashing vs encryption — the difference that matters

**Encryption is two-way.** You lock it with a key, and the same key unlocks it. That
means the original is always recoverable — you're one leaked key away from exposing
every password.

**Hashing is one-way.** `password123` becomes `$2b$10$N9qo8uLOickgx2...`, and there is
**no function that reverses it**. None. Not "hard to reverse" — mathematically not a
thing.

So how do we check a login if we can't un-hash? We don't need to. We hash whatever the
user just typed and compare the two hashes. Same input → same hash. We never need the
original password again, so we should never be able to produce it.

**Storing recoverable passwords is a design mistake, not a security setting.**

### Why bcrypt, and not SHA-256?

SHA-256 _is_ a one-way hash. It's also a _terrible_ password hash, because it's **fast**.
A graphics card computes billions of SHA-256 hashes per second. If someone steals your
database, they can brute-force short passwords in minutes.

bcrypt is deliberately, uselessly **slow**, and gives you two defences:

- **A cost factor** (we use `10`). Each hash takes ~50–100 ms. You notice nothing — you
  log in once. An attacker trying billions of guesses is now looking at centuries. As
  computers get faster, you raise the number.
- **A random salt per password**, stored inside the hash string itself. So two users
  with the same password get _completely different_ hashes. This defeats **rainbow
  tables** (giant precomputed hash → password lookups), and means cracking one hash
  teaches an attacker nothing about the next.

### Why it matters more than it sounds

Databases leak. Backups get copied to laptops. A bucket is left public. If the leaked
table holds plain passwords, every account is compromised instantly — and because people
reuse passwords, so is their email, and their bank.

And beyond leaks: a plain password touches **everything**. It lands in logs when someone
debug-prints the request body. It's in error trackers. It's in backups handed to a
vendor. It's visible to any employee who can run a `SELECT`. Hashing the moment it
arrives means **even you** never hold your users' passwords. That's the position you want.

---

## 5. Two subtle things worth understanding

These are the bits that separate "it works" from "it's correct."

### (a) The ES Modules trap that shaped the code

Look at `middleware/auth.js`. It reads the secret **inside** the function:

```js
export function authenticateToken(req, res, next) {
  ...
  jwt.verify(token, process.env.JWT_SECRET);   // <- read here, at request time
}
```

Why not at the top of the file, like a normal constant? Because of how ES Modules load.

**Every `import` statement in a file runs before any other code in that file.** So in
`server.js`:

```js
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';   // <-- this file is fully evaluated...
...
dotenv.config();                             // <-- ...BEFORE this line runs
```

If `routes/auth.js` grabbed `process.env.JWT_SECRET` at its top level, it would grab
`undefined` — because `.env` hadn't been read yet. The server would then sign every token
with the string `undefined`, and anyone could forge a login.

The fix is to read configuration **at the moment you use it**, not at import time. This
is a real bug that bites people, and it's why the code looks slightly unusual.

### (b) Login is timing-safe

Naively, you'd write:

```js
const user = users.find(...);
if (!user) return res.status(401)...          // returns instantly
const ok = await bcrypt.compare(password, user.passwordHash);  // takes ~80ms
```

Spot the leak? If the username doesn't exist, we reply in ~0 ms. If it does exist but the
password is wrong, we reply in ~80 ms. An attacker can time your responses and **discover
which usernames are registered**, without ever guessing a password.

So we always run a comparison — against a throwaway dummy hash when the user doesn't
exist:

```js
const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
if (!user || !passwordMatches)
  return res.status(401).json({ error: 'Invalid username or password' });
```

Same work either way, same time, same vague message for both failures. Telling the user
_which_ was wrong would confirm the username exists anyway.

---

## 6. What a JWT actually is (and what it isn't)

A JWT is three base64 chunks separated by dots: `header.payload.signature`.

```json
// the payload of a real token from this app, base64-decoded:
{ "sub": "7a69af4d-...", "username": "alice", "iat": 1783528673, "exp": 1783532273 }
```

**Anyone can read that.** Paste a token into <https://jwt.io> and you'll see the payload
without knowing the secret. Base64 is _encoding_, not encryption — it's a way to write
bytes as text, nothing more.

So what does the secret do? It creates the **signature**. The server computes
`sign(header + payload, JWT_SECRET)`. If you change even one character of the payload —
say, `"username":"admin"` — the signature no longer matches, and `jwt.verify()` throws.

Two consequences:

1. **Never put anything sensitive in a JWT.** No passwords. It's a public postcard with
   a tamper-proof seal, not a locked box.
2. **Anyone with `JWT_SECRET` can forge a token for any user.** They don't need a
   password. They just sign `{"username":"admin"}` themselves and your server accepts it.
   That's why the secret is as sensitive as a password, and why it lives in `.env`.

---

## 7. Why tokens must expire

A JWT is a **bearer token**: whoever holds it _is_ you, no questions asked. If one leaks
— from a log file, browser storage, a screen share — the thief has your account.

Now the catch of the stateless design: the server doesn't store tokens, it just checks
signatures. So **there is no list to delete a stolen token from.** You cannot "log out"
a JWT.

Expiry is the only safety net. We set `expiresIn: '1h'`, so a stolen token is worthless
after an hour. Real apps issue a short-lived _access token_ (minutes) plus a long-lived
_refresh token_ that can be revoked — limiting the blast radius.

---

## 8. Status codes, and the one everyone gets wrong

| Code  | We send it when                         | Because                                                |
| ----- | --------------------------------------- | ------------------------------------------------------ |
| `200` | login worked, profile returned          | generic "here's what you asked for"                    |
| `201` | registration worked                     | more precise: a **new resource now exists**            |
| `400` | missing field, short password, bad JSON | the request is malformed; retrying unchanged will fail |
| `401` | no token; bad username/password         | "I don't know who you are"                             |
| `403` | token present, but invalid or expired   | "I know who you claim to be — still no"                |
| `409` | username taken                          | input is _valid_ but clashes with existing state       |

**401 vs 403** is the classic confusion. The rule used here:

- **401** — you sent _no usable credentials_. Go get some and retry.
- **403** — you sent credentials; they don't grant access. Retrying won't help.

(Annoyingly, HTTP names `401` "Unauthorized" when it really means _unauthenticated_.
Don't fight it. Just be consistent.)

---

## 9. Small decisions worth knowing

**`crypto.randomUUID()` instead of the `uuid` package.** The brief listed `uuid` as
optional. Node has UUID generation built in. Every dependency you add is something to
install, audit, and keep patched — so don't add one you don't need.

**The server refuses to boot without `JWT_SECRET`.** It calls `process.exit(1)`. Booting
without a secret would mean signing tokens with `undefined` — a silently insecure server
is far worse than one that won't start. **Fail fast, fail loudly.**

**A JSON error handler.** Without it, malformed JSON makes Express return an HTML error
page — confusing for an API client. Four lines make every response JSON.

---

## 10. How it was verified

Not "it looks right." Every case was executed against the running server:

| Case                                                          | Result                                               |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /` public                                                | `200`                                                |
| `POST /register`                                              | `201`, response contains **no password and no hash** |
| duplicate username                                            | `409`                                                |
| missing field / short password / malformed JSON               | `400`                                                |
| login correct / wrong password / unknown user                 | `200` / `401` / `401`                                |
| `/profile` no header, malformed header, wrong scheme          | `401`                                                |
| `/profile` garbage token                                      | `403`                                                |
| `/profile` **tampered signature** (flipped one character)     | `403`                                                |
| `/profile` **expired token** (signed with `expiresIn: '-1s'`) | `403`                                                |
| `/profile` valid token                                        | `200`                                                |

16 of 16. The expired and tampered tokens were forged deliberately to prove
`jwt.verify()` actually checks both the signature and the clock.

---

## 11. What's deliberately missing

Each of these is what you'd add next:

- **A real database.** `users` is an array; everything vanishes on restart. → _Assignment 03._
- **Refresh tokens.** After an hour you must log in again.
- **Logout / revocation.** Stateless JWTs can't be un-issued.
- **Rate limiting.** Nothing stops 10,000 password guesses against `/login`.
- **HTTPS.** Right now the password (on `/register`) and the token (on every request)
  travel as **plain text over the network**. Anyone on the same wifi can read them.
  Hashing protects the _database_; HTTPS protects the _wire_. You need both.

---

## 12. Where to go next

- Decode one of your own tokens at <https://jwt.io>. Seeing your username sitting there
  in plain text is the fastest way to internalise "a JWT is not encrypted".
- Change `expiresIn` to `'5s'`, log in, wait, and hit `/profile`. Watch the 403 appear.
- **Assignment 03** replaces the array with Postgres — and shows why the layering you
  build now determines how painful that swap is later.
