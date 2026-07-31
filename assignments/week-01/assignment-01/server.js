// server.js — your first CRUD API: a to-do list you can create, read, update,
// and delete over HTTP. The whole thing is one file and under ~100 lines.
//
// CRUD maps onto HTTP methods like this:
//
//   Create  ->  POST   /tasks
//   Read    ->  GET    /tasks   ·   GET /tasks/:id
//   Update  ->  PUT    /tasks/:id
//   Delete  ->  DELETE /tasks/:id
//
// The data lives in a plain array in memory. That means it disappears every time
// the server restarts — which is not a bug, it is the lesson. Assignment 05 keeps
// exactly these endpoints and swaps the array for a real SQLite database, so the
// data survives. The whole point is that the API does not change when it does.

import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { readFile } from 'node:fs/promises';

const app = express();
const PORT = 3000;

// Parse JSON request bodies onto req.body. Without this, POST/PUT could not read
// the task the client sends.
app.use(express.json());

// ---------------------------------------------------------------------------
// The "database": a plain array that lives in memory.
// ---------------------------------------------------------------------------
const tasks = [
  { id: 1, title: 'Read the assignment brief', done: true },
  { id: 2, title: 'Build the CRUD API', done: false },
  { id: 3, title: 'Push to GitHub', done: false },
];

// The next id to hand out. A counter (not tasks.length + 1) so ids are never
// reused even after a delete — reusing ids would let a stale link hit a new task.
let nextId = 4;

// ---------------------------------------------------------------------------
// Stage 1 — the front door: what this API is, and whether it is alive.
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({ name: 'Task API', version: '1.0', endpoints: ['/tasks'] });
});

// Real services expose exactly this so a load balancer can ask "are you up?".
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Stage 2 — Read.
// ---------------------------------------------------------------------------
app.get('/tasks', (req, res) => {
  res.json(tasks);
});

app.get('/tasks/:id', (req, res) => {
  const task = tasks.find((t) => t.id === Number(req.params.id));
  // A missing task is a 404 with an explaining message — never an empty 200.
  // Status codes are how machines read the answer.
  if (!task) {
    return res.status(404).json({ error: `Task ${req.params.id} not found` });
  }
  res.json(task);
});

// ---------------------------------------------------------------------------
// Stage 3 — Create.
// ---------------------------------------------------------------------------
app.post('/tasks', (req, res) => {
  const { title } = req.body ?? {};

  // The server never trusts the client: validate before storing anything.
  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required' });
  }

  const task = { id: nextId++, title: title.trim(), done: false };
  tasks.push(task);
  // 201 Created = "a new resource now exists". Return it, with its new id.
  res.status(201).json(task);
});

// ---------------------------------------------------------------------------
// Stage 4 — Update and Delete.
// ---------------------------------------------------------------------------
app.put('/tasks/:id', (req, res) => {
  const task = tasks.find((t) => t.id === Number(req.params.id));
  if (!task) {
    return res.status(404).json({ error: `Task ${req.params.id} not found` });
  }

  const { title, done } = req.body ?? {};
  if (title === undefined && done === undefined) {
    return res.status(400).json({ error: 'provide title and/or done to update' });
  }
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title must be a non-empty string' });
    }
    task.title = title.trim();
  }
  if (done !== undefined) {
    if (typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    task.done = done;
  }

  res.json(task);
});

app.delete('/tasks/:id', (req, res) => {
  const index = tasks.findIndex((t) => t.id === Number(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: `Task ${req.params.id} not found` });
  }
  tasks.splice(index, 1);
  // 204 No Content = "success, and there is nothing to send back".
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Stage 5 — Swagger UI at /docs.
// swagger-ui-express turns the OpenAPI description in openapi.json into an
// interactive page: every endpoint, with a "Try it out" button that sends real
// requests. It is curl with a friendly face.
// ---------------------------------------------------------------------------
const openapi = JSON.parse(await readFile(new URL('./openapi.json', import.meta.url), 'utf-8'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// ---------------------------------------------------------------------------
// Error handler (last, and takes four arguments so Express recognises it).
// Keeps every response JSON — otherwise a malformed body returns an HTML page.
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Task API running at http://localhost:${PORT}  (interactive docs: /docs)`);
});
