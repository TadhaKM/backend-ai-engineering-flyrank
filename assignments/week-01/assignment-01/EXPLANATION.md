# Assignment 01 — Explanation

> **What this file is:** a plain-English walkthrough of what was built and _why_.
>
> **How it differs from [`README.md`](README.md):** the README tells you how to run
> this and what the endpoints are. This file explains the thinking behind it.

---

## 1. What the task was

Build the smallest possible backend that actually works: a program that sits on your
computer, waits for someone to ask it a question over the network, and answers with
JSON. Two questions, two answers. Nothing else.

The point isn't the code — it's ~12 lines. The point is understanding what a "backend"
actually _is_.

---

## 2. What a backend actually is

Before the code, the mental model.

A **server** is not a special machine. It's just **a program that doesn't exit**. Most
programs run, do a thing, and stop. A server starts, then sits in a loop waiting for
someone to talk to it. That's the whole difference.

It waits at a **port** — a number, like `3000`. Think of your computer as an apartment
building: the IP address is the street address, and the port is the apartment number.
Many programs can run on one machine, so the port says _which_ one you want.

When you type `http://localhost:3000/about` into a browser:

- `localhost` = "this computer, the one I'm sitting at"
- `3000` = "the program listening at door 3000"
- `/about` = "the thing I want from it"

The browser opens a connection and sends a short piece of **text**:

```text
GET /about HTTP/1.1
Host: localhost:3000
```

That's it. HTTP is just text with a method (`GET` = "give me something") and a path
(`/about`). The server sends text back. Everything else — images, videos, apps — is
built on top of that.

---

## 3. What was built

Four files. That's the entire project.

### `server.js` — the whole backend

```js
import express from 'express';   // 1. bring in the library
const app = express();           // 2. create the server
const PORT = 3000;               // 3. pick a door number

app.get('/', (req, res) => {                          // 4. define a route
  res.json({ message: 'Hello from my backend!' });
});

app.get('/about', (req, res) => {
  res.json({ name: '...', course: 'Computer Science' });
});

app.listen(PORT, () => { ... });  // 5. open the door and wait
```

Read it as five steps. Import, create, configure, define routes, listen. Almost every
backend you ever write has this shape, no matter how big it grows.

**`app.get('/about', handler)`** means: _"when a GET request arrives for `/about`, run
this function."_ The function gets two objects:

- **`req`** (request) — everything the client sent you.
- **`res`** (response) — the tools to reply.

**`res.json({...})`** does three things at once:

1. Turns your JavaScript object into a JSON string: `{"name":"...","course":"..."}`
2. Sets the header `Content-Type: application/json` — a label saying "the body is JSON"
3. Sends status `200 OK`, the headers, and the body back down the connection

That header is why your browser shows you readable JSON instead of trying to render a
web page. The browser reads the label and decides how to display the body.

### `package.json` — the project's ID card

Says what the project is called, and — critically — that it **depends on Express**.
`npm install` reads this file and downloads Express for you.

### `.gitignore` — what git should pretend doesn't exist

One line: `node_modules`. See §5.

### `README.md` — how to run it

---

## 4. Why it was built this way

### Why Express and not plain Node?

Node can already run a web server on its own (`http.createServer`). But then _you_ have
to parse the URL, match the path, set headers, and stringify JSON by hand — maybe 40
lines to do what Express does in 3. Express is a thin layer that handles the boring
parts. It's the most common choice in Node, so learning it transfers everywhere.

### Why port 3000?

Pure convention. Nothing special about it. Ports below 1024 need admin rights, and 3000
is the unofficial default for Node development. `8080` and `5000` are equally common.

### Why `import` and not `require`?

You'll see both. `require(...)` is the old CommonJS style; `import ...` is the modern ES
Modules standard, and it's what the rest of this repository uses. Setting
`"type": "module"` in `package.json` is what tells Node to expect `import`.

### Why the TypeScript scaffold was deleted

The generator creates every assignment with TypeScript, tests, and a `tsconfig.json`.
The brief said "as simple as possible, ~20–30 lines". Keeping a type-checker and a test
runner around for a 12-line file would have been noise, so `src/`, `tests/`,
`tsconfig.json`, and `.env.example` were removed. **Match the tool to the job.**

---

## 5. Concepts you should understand from this

### `node_modules` and why we never commit it

When you run `npm install`, npm reads `package.json`, downloads Express — _and_
everything Express itself depends on, and everything _those_ depend on. The result is
a `node_modules/` folder with thousands of files.

You never commit it, for two reasons:

1. **It's huge.** Tens of thousands of files for even a small project.
2. **It's reproducible.** Anyone with your `package.json` can regenerate it exactly by
   running `npm install`. Committing it is like emailing someone a photocopy of a book
   when you could just tell them the ISBN.

That's what `.gitignore` is for: a list of things git should never track.

`package-lock.json` **is** committed, though. It records the _exact_ versions that were
installed, so everyone gets an identical `node_modules`.

### HTTP is stateless

After the server replies, it forgets everything. The next request starts from nothing.
The server has no memory that you just visited `/`. This sounds like a limitation, but
it's why the web scales: any server can handle any request, because none of them are
holding onto anything.

(When an app _does_ need to remember you — "you're logged in" — it has to send proof
with every single request. That's Assignment 02.)

### The request → response cycle, end to end

```text
browser ──GET /about──▶ Node ──▶ Express walks its routes in order
                                    │  app.get('/')      -> path doesn't match
                                    │  app.get('/about') -> match! run the handler
                                    ▼
                              res.json({...})
                                    │  stringify + set Content-Type + status 200
browser ◀── 200 OK + JSON body ─────┘
```

If no route matches, Express replies `404 Not Found` for you — that's why
`GET /nope` returns 404 without you writing any code for it.

---

## 6. Why `git init` must NOT be run in this folder

The brief asks you to show `git init`, `git add`, `git commit -m "Initial backend"`,
`git remote add origin`, and `git push`. Those are correct **for a standalone project**.

But this folder lives inside the `backend-ai-engineering-flyrank` repository, which
already has its own `.git/` folder and its own GitHub remote. Running `git init` here
would create a **nested repository** — a second `.git/` inside the first. Git would
start treating this folder as a separate, disconnected project, and the outer repo would
stop tracking your files properly. It's a genuinely annoying mess to unpick.

So the commands are documented in the README for learning, but here you just
`git add` / `git commit` / `git push` from the repository root.

---

## 7. How it was verified

Not "it looks right" — it was actually run:

- Started the server, confirmed `Server running at http://localhost:3000`
- `GET /` → `200`, body `{"message":"Hello from my backend!"}`, header
  `Content-Type: application/json; charset=utf-8`
- `GET /about` → `200` with the correct JSON
- `GET /nope` → `404` (proving Express's default behaviour)
- Re-ran the exact commands the README tells you to run, including
  `npm start --workspace assignments/week-01/assignment-01`

---

## 8. Things to be aware of

**The comments were removed.** The brief explicitly required: _"Add clear comments
explaining what each section of the code does."_ The version of `server.js` that got
committed has had all its comments stripped out. If this is being graded against the
brief, that requirement currently isn't met — worth restoring them.

**The name is lowercase.** `/about` returns `"name": "tadhagath marepalli"`. It's
rendered straight into the API response exactly as written, so capitalise it if that
matters.

**Assignments 01 and 02 both listen on port 3000.** Only run one at a time, or you'll
get `EADDRINUSE` (address already in use).

---

## 9. Where to go next

- Add a route that reads part of the URL: `app.get('/greet/:name', ...)` and use
  `req.params.name`. That's how real APIs take arguments.
- Try `curl -i` on your endpoints and read the raw headers. Everything the browser does
  is visible there.
- **Assignment 02** takes this exact server and adds real user accounts — which is where
  "HTTP is stateless" stops being trivia and starts being the central problem to solve.
