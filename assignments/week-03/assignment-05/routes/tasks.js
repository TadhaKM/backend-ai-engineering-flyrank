// routes/tasks.js
//
// The HTTP layer for tasks. This file knows about requests, status codes, and
// validation — and NOTHING about SQL. It receives a `store` (from db.js) and
// calls its plain functions. Swap SQLite for anything else and this file does
// not change; that is the separation the assignment is about.
//
//   GET    /tasks         list tasks (optional ?done= and ?search=)
//   GET    /tasks/:id     one task
//   POST   /tasks         create a task
//   PUT    /tasks/:id     update a task
//   DELETE /tasks/:id     delete a task
//   GET    /stats         counts (done / not done / total)

import { Router } from 'express';

/**
 * @param {ReturnType<import('../db.js').createTaskStore>} store
 */
export function createTasksRouter(store) {
  const router = Router();

  // --- READ ----------------------------------------------------------------

  // GET /tasks — every task, or a filtered subset.
  router.get('/tasks', (req, res) => {
    const filters = {};

    // ?done=true / ?done=false. Anything else is a client mistake, so say so
    // rather than silently ignoring it.
    if (req.query.done !== undefined) {
      const done = parseBool(req.query.done);
      if (done === null) {
        return res.status(400).json({ error: 'done must be true or false' });
      }
      filters.done = done;
    }

    // ?search=milk — substring match on the title.
    if (typeof req.query.search === 'string' && req.query.search.trim() !== '') {
      filters.search = req.query.search.trim();
    }

    return res.json(store.list(filters));
  });

  // GET /tasks/:id — one task, or 404.
  router.get('/tasks/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const task = store.getById(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    return res.json(task);
  });

  // --- CREATE --------------------------------------------------------------

  // POST /tasks — body: { "title": "...", "done"?: false }
  router.post('/tasks', (req, res) => {
    const { title, done } = req.body ?? {};

    // Same validation rules the in-memory version had. Never trust the client.
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title is required' });
    }
    if (done !== undefined && typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }

    const task = store.create({ title: title.trim(), done });
    // 201 Created = "a new resource now exists". Return it, with its new id.
    return res.status(201).json(task);
  });

  // --- UPDATE --------------------------------------------------------------

  // PUT /tasks/:id — update title and/or done. Missing fields are left unchanged.
  router.put('/tasks/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const { title, done } = req.body ?? {};
    const changes = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'title must be a non-empty string' });
      }
      changes.title = title.trim();
    }
    if (done !== undefined) {
      if (typeof done !== 'boolean') {
        return res.status(400).json({ error: 'done must be a boolean' });
      }
      changes.done = done;
    }
    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ error: 'provide title and/or done to update' });
    }

    const task = store.update(id, changes);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    return res.json(task);
  });

  // --- DELETE --------------------------------------------------------------

  // DELETE /tasks/:id — 204 on success, 404 if it never existed.
  router.delete('/tasks/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'id must be a positive integer' });
    }

    const removed = store.remove(id);
    if (!removed) {
      return res.status(404).json({ error: 'Task not found' });
    }
    // 204 No Content = "done, and there is nothing to send back".
    return res.status(204).end();
  });

  // --- STATS ---------------------------------------------------------------

  // GET /stats — counts computed by SQL (the COUNT()/SUM() extra).
  router.get('/stats', (req, res) => {
    return res.json(store.stats());
  });

  return router;
}

// ---------------------------------------------------------------------------
// Small validation helpers
// ---------------------------------------------------------------------------

/**
 * Parse a route `:id` into a positive integer, or `null` if it is not one.
 *
 * `/tasks/abc` and `/tasks/-1` are malformed input (400), which is a different
 * thing from `/tasks/9999` — a well-formed id that simply has no task (404).
 * Keeping those two apart is what makes the API honest about what went wrong.
 */
function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 'true'/'false' (and '1'/'0') → boolean; anything else → null (invalid). */
function parseBool(raw) {
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}
