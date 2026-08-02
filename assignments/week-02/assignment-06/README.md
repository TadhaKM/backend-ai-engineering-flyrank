# Assignment 06 — Supabase Auth: Login & Protect

> **Status:** 🟢 Code complete — routing, validation, middleware, and every status
> code verified with tests + curl. **The live Supabase calls (real signup/login/token
> verification) need your own Supabase project to exercise** — see
> [Verification](#verification-what-was-actually-run).

A secure API that delegates authentication to **Supabase Auth**: sign up, log in, log
out, and guard protected routes with the JWTs Supabase issues. Documented in Swagger UI.

This is the **managed-identity** counterpart to
[assignment-02](../assignment-02/), which rolls its own bcrypt hashing and JWT signing
by hand. Here we do the opposite — and the production-recommended thing: let a
dedicated **Identity Provider** own passwords and tokens, and keep only the _guarding_
in our code.

### The trust triangle

```
        (1) email + password            (2) JWT
Client ───────────────────────▶ Supabase ──────▶ Client
   │                                                 │
   │  (3) request + Authorization: Bearer <JWT>      │
   ▼                                                 │
Our backend ──(4) getUser(token)──▶ Supabase ✓/✗ ◀──┘
   │
   └─ valid? open the protected door.
```

Our server never sees a password and never signs a token. It only **verifies** the
token Supabase minted, on every protected request.

---

## API reference

| Method | Path                   | Auth       | Body                  | Success       | Errors        |
| ------ | ---------------------- | ---------- | --------------------- | ------------- | ------------- |
| `GET`  | `/public/info`         | none       | —                     | `200` message | —             |
| `POST` | `/auth/signup`         | none       | `{ email, password }` | `201` user    | `400`         |
| `POST` | `/auth/login`          | none       | `{ email, password }` | `200` tokens  | `400` · `401` |
| `POST` | `/auth/logout`         | **Bearer** | —                     | `204`         | `401`         |
| `GET`  | `/protected/profile`   | **Bearer** | —                     | `200` profile | `401`         |
| `GET`  | `/protected/dashboard` | **Bearer** | —                     | `200`         | `401`         |

**Status codes**, exactly as the brief requires: `201` on signup, `200` on
login/read, `204` on logout, `400` on missing input, `401` on a missing, malformed,
invalid, or expired token (and on bad login credentials).

---

## Setup

### 1. Create a Supabase project

1. Sign up free at [supabase.com](https://supabase.com) and create a project.
2. In the dashboard: **Project Settings → API**. Copy two things:
   - **Project URL** → `SUPABASE_URL`
   - the **`anon` public key** → `SUPABASE_KEY` (this is the client-safe key — **not**
     the `service_role` key, which must never go in this project).

### 2. Local environment

```bash
cp .env.example .env
# then edit .env and paste your Project URL and anon key
```

`.env` is git-ignored; `.env.example` is committed. **Never commit your keys.**

### 3. Run it

```bash
npm install                                  # from the repo root, once
npm start --workspace @flyrank/assignment-06
```

```text
Server running and connected to Supabase — http://localhost:3000 (docs: /docs)
```

Stop with **Ctrl+C**.

---

## Try it — `curl`

```bash
# 1. sign up
curl -i -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'          # 201

# 2. log in — copy the access_token from the response
curl -i -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'          # 200 + tokens

# 3. use the token on a protected route
curl -i http://localhost:3000/protected/profile \
  -H "Authorization: Bearer <PASTE_ACCESS_TOKEN>"                     # 200 + your profile

# tamper with one character of the token -> 401 Invalid or expired token
# omit the header entirely            -> 401 Access token required

# 4. log out
curl -i -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <PASTE_ACCESS_TOKEN>"                     # 204
```

> **Email confirmation:** a fresh Supabase project has "Confirm email" **on** by
> default, so `login` right after `signup` may return `401` until the address is
> confirmed. Turn it off under **Authentication → Providers → Email** for local
> testing, or confirm via the link Supabase emails.

---

## See it — Swagger UI

Open **<http://localhost:3000/docs>**. Protected routes show a **padlock**. Click
**Authorize**, paste an `access_token`, and "Try it out" on `/protected/profile`
straight from the browser.

The lock comes from a `bearerAuth` security scheme (`type: http`, `scheme: bearer`) in
[openapi.json](openapi.json), applied to the `/protected/*` and `/auth/logout` routes.

> 📸 **Screenshot for your submission:** open `/docs`, click **Authorize**, and
> screenshot the routes with the padlock icons. Save it as `docs-screenshot.png` here:
> `![Swagger UI](docs-screenshot.png)`

---

## How the guard works

Token-checking lives in **one** place — [middleware/requireAuth.js](middleware/requireAuth.js) —
not copy-pasted into each route. It:

1. reads the `Authorization` header; missing or not `Bearer <token>` → `401 Access token required`;
2. calls `supabase.auth.getUser(token)` to verify it; invalid/expired/unreachable → `401 Invalid or expired token`;
3. on success, attaches the Supabase user to `req.user` and calls `next()`.

`/protected/profile`, `/protected/dashboard`, and `/auth/logout` all reuse it, so a new
protected route is one line away and can't forget the check.

---

## Project structure

```text
assignment-06/
├── server.js              # entry point: load .env, build Supabase adapter, listen
├── app.js                 # builds the Express app over an auth service (tests inject a fake)
├── authService.js         # THE ONLY FILE that imports @supabase/supabase-js
├── middleware/
│   └── requireAuth.js     # the Bearer-token guard (factory over the auth service)
├── routes/
│   ├── auth.js            # /auth/signup, /auth/login, /auth/logout
│   └── protected.js       # /protected/profile, /protected/dashboard  (mounted under /protected)
├── openapi.json           # Swagger description + bearerAuth scheme
├── tests/auth.test.js     # supertest + a fake auth service — no real Supabase needed
└── package.json
```

The **seam** is deliberate and mirrors [assignment-03](../assignment-03/): everything
depends on a tiny four-method `auth` service (`signUp`, `login`, `getUser`, `logout`),
and only `authService.js` knows Supabase exists. That's what lets the tests verify every
status code with a fake, and it's what would let you swap Supabase for another IdP by
changing one file.

---

## Verification: what was actually run

Supabase is an external hosted service, so the calls that hit Supabase can only be
exercised against a real project. Everything that is **our** logic was verified.

### ✅ Verified (tests + curl)

- **16 automated tests** ([tests/auth.test.js](tests/auth.test.js)) drive the real
  Express app against a **fake auth service**, pinning down every status code: `201`
  signup, `200` login with tokens, `400` on missing input and on Supabase-rejected
  signup, `401` on bad credentials / missing / malformed / invalid token, `204` logout
  (and logout still `204` if the Supabase revoke throws), and Swagger serving at `/docs`.
- **Live curl** against a running server (with a placeholder `SUPABASE_URL`): the boot
  log, `/public/info` → `200`, `/protected/profile` → `401 Access token required` (no
  header) and `401 Invalid or expired token` (bogus token), `/auth/signup {}` → `400`,
  `/auth/logout` (no token) → `401`, `/docs/` → `200`.

### ❌ Not verified (needs your Supabase project)

- Real `signup` / `login` round-trips creating a user and returning genuine tokens.
- `getUser` accepting a **real** valid token → `200` with real metadata.
- `logout` actually revoking a session in Supabase.

The middleware treats an unreachable Supabase the same as a bad token (→ `401`), so the
guard behaves safely even before you plug in real keys. Plug in your project and run the
[curl walkthrough](#try-it--curl) to close the gap.

---

## Notes

- **Express, not Next.js.** The brief's JS lane suggests Next.js; this repo is Express
  end to end (assignments 01–05), so it stays Express + `swagger-ui-express` for
  consistency. The API, status codes, and Supabase integration are identical either way.
- **Logout and stateless JWTs.** A JWT is self-contained and valid until it expires;
  there's no server-side "session" to delete for the access token itself. `logout`
  best-effort revokes the _refresh_ token in Supabase and returns `204`; the client is
  expected to discard the access token. See the note in
  [authService.js](authService.js).
- **The anon key is not a secret in the usual sense** — it's meant to be used from
  clients — but it still doesn't belong in git, and the `service_role` key must never
  appear in this project at all.

### ★ Bonus (Stage 7 — "AI vs Me"): not included

The optional bonus asks _you_ to prompt an AI to rebuild this, then compare. That's a
personal exercise (your prompt, your analysis), so it's left for you to add as an
`AI-vs-Me.md` if you want the extra commits.
