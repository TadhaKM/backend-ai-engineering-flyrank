// app.js — assembles the Express application, given a task store.
//
// Kept separate from server.js on purpose. `server.js` opens a real database and
// starts listening on a port; `app.js` just wires routes onto an app and hands it
// back. That split is what lets the tests build an app over a throwaway database
// and drive it in-process, with no port and no network. See tests/tasks.test.js.

import express from 'express';
import { createTasksRouter } from './routes/tasks.js';

/**
 * @param {ReturnType<import('./db.js').createTaskStore>} store
 */
export function createApp(store) {
  const app = express();

  // Parse JSON request bodies onto req.body. Without it, POST/PUT could not read
  // the task they were sent.
  app.use(express.json());

  // A friendly index so hitting the root in a browser explains the API.
  app.get('/', (req, res) => {
    res.json({
      message: 'Tasks API — CRUD over SQLite',
      endpoints: [
        'GET /tasks',
        'GET /tasks/:id',
        'POST /tasks',
        'PUT /tasks/:id',
        'DELETE /tasks/:id',
        'GET /stats',
      ],
    });
  });

  app.use(createTasksRouter(store));

  // Any route that fell through is a 404 in JSON (not Express's default HTML).
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler — must be last and must take four arguments for Express to
  // recognise it. Keeps every response JSON, including a malformed request body.
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Request body is not valid JSON' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
