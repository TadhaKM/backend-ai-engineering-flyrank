# Assignment 06 — Explanation

> **What this file is:** a plain-English walkthrough of what was built and _why_ —
> written so a non-technical reader can follow it.
>
> **How it differs from [`README.md`](README.md):** the README tells you how to set it
> up and run it. This file explains the ideas underneath.

---

## 1. What the task was

Build an API where people can **sign up, log in, and log out**, and where certain doors
are **locked** — only openable by someone who has logged in. The twist: instead of
writing the password and security code ourselves, we hand that job to a specialist
service called **Supabase**.

This is the grown-up way to do authentication. [Assignment 02](../assignment-02/) built
the same idea _by hand_ — hashing passwords, signing tokens — which is fantastic for
learning but discouraged in the real world, because security code is extremely easy to
get subtly, catastrophically wrong. Real teams delegate it. This assignment is that
delegation.

---

## 2. The big idea: a trust triangle

There are three parties, and the clever part is that our server never handles the
password at all.

1. **The client** (a browser, a phone app) sends the email and password straight to
   **Supabase** — not to us.
2. **Supabase** checks them and, if they're right, hands the client a **token** — a JWT.
   Think of it as a wristband at a festival: hard to forge, and it proves you paid to
   get in without the gate staff having to re-check your ticket every time.
3. The client then talks to **our server**, showing the wristband on every request (in
   a header: `Authorization: Bearer <token>`).
4. Our server asks Supabase "is this wristband real and still valid?" If yes, we open
   the protected door.

The security-critical work — storing passwords, checking them, minting tokens — all
happens inside Supabase. Our server's only job is to **check the wristband** at the
door. That's a much smaller, safer job.

---

## 3. What a JWT actually is

A **JWT** (JSON Web Token) is a string that carries a few facts about who you are (your
user id, your email, when the token expires), plus a **cryptographic signature**. The
signature is the important bit: it's made with a secret only Supabase knows, so anyone
can _read_ the token but nobody can _change_ it or _fake_ one without being caught.

That's why our server can trust it without calling a database on every request — though
here we do double-check with Supabase's `getUser`, which also catches tokens that have
been revoked or expired.

Two things follow from "a JWT is self-contained":

- It's why login gives you a token you carry around, instead of the server remembering
  you.
- It's why **logout is a little odd** — see §6.

---

## 4. The status codes, and why each one

An API answers with a three-digit code before any human reads the body. This assignment
is strict about them, because they're how the client's code knows what happened:

| Code  | When                                          | Meaning                          |
| ----- | --------------------------------------------- | -------------------------------- |
| `201` | signup succeeded                              | "a new account now exists"       |
| `200` | login / reading your profile                  | "here's what you asked for"      |
| `204` | logout                                        | "done, nothing to send back"     |
| `400` | you left out the email or password            | "your input is wrong"            |
| `401` | no token, a broken token, or a wrong password | "you haven't proven who you are" |

The one worth dwelling on is **`401`**. It covers _four_ different situations — no
`Authorization` header, a header that isn't `Bearer <token>`, a token that's been
tampered with or expired, and a wrong password at login. They're all the same answer to
the client: _"I can't confirm you're allowed in."_ We deliberately don't say _which_ of
the four went wrong on a login, because "that email doesn't exist" versus "wrong
password" would quietly tell an attacker which emails have accounts.

---

## 5. The guard, written once

Checking the token is fiddly, and it's needed on every locked door. Writing that check
inside each route would mean copy-pasting it — and the day you forget to paste it, you
have an unlocked door you _think_ is locked. That's a classic real-world breach.

So the check lives in exactly one place: a **middleware** — a function that runs _before_
the actual route. It reads the header, verifies the token with Supabase, and either
rejects the request (`401`) or waves it through with the verified user attached. Every
protected route — the profile, the dashboard, logout — reuses that one function. Adding
a new locked door is a single line, and it's impossible to forget the lock.

This is the same lesson as the repository seam in
[assignment-03](../assignment-03/): find the thing you'd otherwise repeat, name it once,
and depend on the name.

---

## 6. Why logout is strange

You'd think "log out" means "destroy the token." But a JWT is self-contained — it's
valid because of its signature and its expiry date, not because a server is keeping a
list of who's logged in. There's no central "logged-in" list to delete you from.

So logout does two smaller things: it asks Supabase to invalidate the **refresh** token
(the thing used to get _new_ access tokens), and it trusts the client to throw away the
access token it's holding. The access token itself keeps working until it expires —
usually an hour. This isn't a bug; it's the nature of stateless tokens, and it's why the
endpoint returns `204` (success) even though nothing was truly "destroyed" server-side.
The README says this honestly rather than pretending logout is instant revocation.

---

## 7. How I built it so it could be tested without Supabase

Here's a practical problem: Supabase is a service that lives on the internet and needs a
real account. How do you verify your code is right without signing up and wiring in live
keys on every test run?

The answer is a **seam**. All the Supabase-specific code is bottled up in one small file
(`authService.js`) that exposes four plain functions: `signUp`, `login`, `getUser`,
`logout`. Every other file depends only on those four functions — not on Supabase.

That means the tests can hand the app a **fake** version of those four functions that
returns canned answers ("pretend this token is valid", "pretend login failed"). The real
Express app runs for real; only the Supabase call is faked. That's enough to prove every
status code and every branch of the guard — 16 tests, no account, no network.

What it _can't_ prove is that Supabase itself behaves as expected — that a real signup
creates a real user, that a real token verifies. Those need a live project, and the
README is upfront that they're the untested part.

---

## 8. How it was verified

- **16 automated tests** against the real app with a fake Supabase: public route open;
  signup `201` / `400`; login `200` with tokens / `400` / `401`; profile and dashboard
  `401` for missing, malformed, and invalid tokens and `200` for a valid one; logout
  `204` (and still `204` if the revoke call throws); Swagger serving at `/docs`.
- **A running server, hit with curl** (with a placeholder Supabase URL): the startup
  log appears, the public route returns `200`, the protected routes correctly reject
  missing and bogus tokens with the right `401` messages, bad input is `400`, and the
  Swagger page loads.
- **Not verified:** the real Supabase round-trips (a genuine signup/login/verify). Those
  are yours to run once you paste in your project's URL and anon key.

---

## 9. Where this sits

- **Contrast:** [assignment-02](../assignment-02/) is the _same goal_ — accounts, login,
  a protected route — done from scratch with bcrypt and hand-signed JWTs. Read the two
  together to see what "use an Identity Provider" actually buys you: far less
  security-critical code of your own.
- **Echo:** the one-file seam here (`authService.js`) is the same move as
  [assignment-03](../assignment-03/)'s repository — isolate the external thing behind a
  tiny interface so the rest of the app, and the tests, don't depend on it.
