# Assignment 01 — Minimal Express Backend

> **Status:** 🟢 Complete — server verified running, both endpoints return the expected JSON.

The smallest useful Node.js backend: an Express server on port `3000` with exactly
two JSON endpoints. The goal is to understand how a backend receives a request and
sends back a response.

---

## What it does

| Method & path | Response                                                |
| ------------- | ------------------------------------------------------- |
| `GET /`       | `{ "message": "Hello from my backend!" }`               |
| `GET /about`  | `{ "name": "Your Name", "course": "Computer Science" }` |

> ✏️ Open [`server.js`](server.js) and replace `"Your Name"` with your actual name.

---

## Project structure

```text
assignment-01/
├── server.js       # the entire backend (~25 lines)
├── package.json    # project name + the express dependency
├── .gitignore      # keeps node_modules out of git
└── node_modules/   # installed packages (created by npm install, never committed)
```

After installing, npm also creates a `package-lock.json`, which pins the exact
dependency versions. Commit that file; never commit `node_modules/`.

---

## 1. Install dependencies

```bash
npm install
```

**What this does:** npm reads the `dependencies` section of `package.json`, downloads
Express (and everything Express itself needs) from the npm registry, and puts it all
in a `node_modules/` folder. You only need to do this once — or again whenever
`package.json` changes.

`node_modules/` is big and fully reproducible from `package.json`, which is exactly
why it's listed in `.gitignore` instead of being committed.

## 2. Start the server

```bash
node server.js
```

You should see:

```text
Server running at http://localhost:3000
```

The process stays running and waits for requests. Stop it with **Ctrl+C**.

> `npm start` does the same thing — it's a shortcut defined in `package.json`.

## 3. Test both endpoints

### In a web browser

With the server running, visit:

- <http://localhost:3000/> → `{"message":"Hello from my backend!"}`
- <http://localhost:3000/about> → `{"name":"Your Name","course":"Computer Science"}`

The browser shows the raw JSON (Firefox and Chrome pretty-print it automatically).

### Using curl

Open a **second terminal** — the first one is busy running the server:

```bash
curl http://localhost:3000/
# {"message":"Hello from my backend!"}

curl http://localhost:3000/about
# {"name":"Your Name","course":"Computer Science"}
```

Add `-i` to also see the response headers, which confirms the content type:

```bash
curl -i http://localhost:3000/
# HTTP/1.1 200 OK
# Content-Type: application/json; charset=utf-8
#
# {"message":"Hello from my backend!"}
```

Any other path returns `404 Not Found`, because no route matches it.

---

## 4. `.gitignore`

[`.gitignore`](.gitignore) contains a single line:

```text
node_modules
```

This tells git "never track this folder". Without it you'd commit tens of thousands of
dependency files.

---

## 5. Git commands

For a **standalone** project, this is the full sequence from empty folder to GitHub:

```bash
git init                                                     # create a local repository
git add .                                                    # stage every non-ignored file
git commit -m "Initial backend"                              # save a snapshot
git branch -M main                                           # name the branch "main"
git remote add origin https://github.com/USERNAME/REPO.git   # link to GitHub
git push -u origin main                                      # upload; -u remembers the target
```

| Command      | Meaning                                                            |
| ------------ | ------------------------------------------------------------------ |
| `git init`   | Turns the folder into a git repository (creates a hidden `.git/`). |
| `git add .`  | Stages changes — marks what goes into the next commit.             |
| `git commit` | Records a permanent snapshot of the staged files.                  |
| `git remote` | Tells git where the GitHub copy lives (nicknamed `origin`).        |
| `git push`   | Sends your commits up to GitHub.                                   |

> ⚠️ **In this repository, do NOT run `git init` here.** This folder already lives
> inside the `backend-ai-engineering-flyrank` repo, which has its own `.git/` and an
> `origin` remote. Running `git init` here would create a **nested repository** and git
> would stop tracking these files properly. The commands above are shown because the
> assignment asks for them — for this repo, just `git add`, `git commit`, and
> `git push` from the repo root.

---

## How the request → response cycle works

Say you type `http://localhost:3000/about` into your browser.

**1. The browser sends a request.**
`localhost` means "this computer" and `3000` is the port — the door number the server
is listening at. The browser opens a connection and sends a short text message:

```text
GET /about HTTP/1.1
Host: localhost:3000
```

That's it: a **method** (`GET` = "give me something") and a **path** (`/about`).

**2. Express matches a route.**
Node hands the request to Express. Express walks through the routes you registered, in
the order you wrote them, looking for the first one where the method _and_ the path
both match:

```js
app.get('/', ...)       // method GET, path "/"       -> path doesn't match
app.get('/about', ...)  // method GET, path "/about"  -> match! run this function
```

It then calls that function with two objects: `req` (everything about the incoming
request) and `res` (the tools to build a reply). If nothing matches, Express sends a
`404 Not Found` for you.

**3. `res.json()` sends the response.**
`res.json({ name: 'Your Name', course: 'Computer Science' })` does three things:

1. Converts the JavaScript object into a JSON string —
   `{"name":"Your Name","course":"Computer Science"}`
2. Sets the header `Content-Type: application/json`, which labels the body so the
   receiver knows how to interpret it.
3. Sends the status line (`200 OK`), the headers, and the body back over the connection.

**4. The browser or curl receives it.**
The reply arrives as text:

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"name":"Your Name","course":"Computer Science"}
```

- The **browser** reads `Content-Type: application/json`, so instead of rendering a web
  page it displays the JSON (usually in a collapsible viewer).
- **curl** doesn't interpret anything — it just prints the body to your terminal.

Then the connection finishes and the server goes back to waiting. The server keeps no
memory of what just happened; each request is handled independently. That's what
"stateless" means in HTTP.

```text
browser  ──GET /about──▶  Node  ──▶  Express matches the route
                                          │
                                          ▼
                                    res.json({...})
                                          │
browser  ◀──200 OK + JSON body────────────┘
```
