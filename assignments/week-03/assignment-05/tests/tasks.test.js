// tests/tasks.test.js
//
// Drives the real API against a real SQLite database — just a throwaway one in a
// temp file instead of tasks.db. supertest runs the Express app in-process, so
// there is no port and no network. Each test gets its own fresh database.
//
// The headline tests are the ones that prove the whole point of the assignment:
// "data survives a restart" and "the seed data appears exactly once".

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { openDatabase, createTaskStore } from '../db.js';
import { createApp } from '../app.js';

/** Open a brand-new database in a temp file and build an app over it. */
function bootstrap(file) {
  const db = openDatabase(file);
  const app = createApp(createTaskStore(db));
  return { db, app };
}

/** Remove a temp database and its WAL sidecars. */
function cleanup(file) {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(file + suffix, { force: true });
  }
}

describe('Tasks API on SQLite', () => {
  let file;
  let db;
  let app;

  beforeEach(() => {
    file = join(tmpdir(), `tasks-test-${randomUUID()}.db`);
    ({ db, app } = bootstrap(file));
  });

  afterEach(() => {
    db.close();
    cleanup(file);
  });

  // --- seeding -------------------------------------------------------------

  it('seeds exactly three example tasks on a fresh database', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toMatchObject({ id: 1, title: 'Read the README', done: false });
  });

  it('does not re-seed when the database already has tasks (restart)', () => {
    // Reopening the SAME file simulates restarting the server. The seed must not
    // run again, or the three examples would become six.
    db.close();
    const reopened = openDatabase(file);
    const count = reopened.prepare('SELECT COUNT(*) AS c FROM tasks').get().c;
    reopened.close();
    // reopen once more so afterEach has a live handle to close.
    ({ db, app } = bootstrap(file));

    expect(count).toBe(3);
  });

  // --- persistence (the whole point) --------------------------------------

  it('keeps created tasks after the database is closed and reopened', async () => {
    await request(app).post('/tasks').send({ title: 'Survive a restart' }).expect(201);

    // Close everything, then reopen the same file — a real restart.
    db.close();
    ({ db, app } = bootstrap(file));

    const res = await request(app).get('/tasks');
    const titles = res.body.map((t) => t.title);
    expect(titles).toContain('Survive a restart');
    expect(res.body).toHaveLength(4); // 3 seeded + 1 created, still there
  });

  // --- read ----------------------------------------------------------------

  it('GET /tasks/:id returns one task', async () => {
    const res = await request(app).get('/tasks/1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, title: 'Read the README' });
  });

  it('GET /tasks/:id returns 404 for an unknown id', async () => {
    const res = await request(app).get('/tasks/9999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  it('GET /tasks/:id returns 400 for a malformed id', async () => {
    const res = await request(app).get('/tasks/not-a-number');
    expect(res.status).toBe(400);
  });

  // --- create --------------------------------------------------------------

  it('POST /tasks creates a task and returns 201 with a real boolean done', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Buy milk' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Buy milk', done: false });
    expect(res.body.id).toBeTypeOf('number');
    expect(res.body.created_at).toBeTruthy();
  });

  it('POST /tasks rejects a missing title with 400', async () => {
    const res = await request(app).post('/tasks').send({ done: true });
    expect(res.status).toBe(400);
  });

  it('POST /tasks rejects a non-boolean done with 400', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', done: 'yes' });
    expect(res.status).toBe(400);
  });

  // --- update --------------------------------------------------------------

  it('PUT /tasks/:id updates only the fields provided', async () => {
    const res = await request(app).put('/tasks/1').send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, title: 'Read the README', done: true });
    expect(res.body.updated_at >= res.body.created_at).toBe(true);
  });

  it('PUT /tasks/:id returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/9999').send({ done: true });
    expect(res.status).toBe(404);
  });

  it('PUT /tasks/:id with nothing to change returns 400', async () => {
    const res = await request(app).put('/tasks/1').send({});
    expect(res.status).toBe(400);
  });

  // --- delete --------------------------------------------------------------

  it('DELETE /tasks/:id removes the task (204), then it is gone (404)', async () => {
    await request(app).delete('/tasks/1').expect(204);
    await request(app).get('/tasks/1').expect(404);
  });

  it('DELETE /tasks/:id returns 404 for an unknown id', async () => {
    await request(app).delete('/tasks/9999').expect(404);
  });

  // --- filters & stats (the optional extras) -------------------------------

  it('GET /tasks?done=true returns only completed tasks', async () => {
    await request(app).put('/tasks/1').send({ done: true });
    const res = await request(app).get('/tasks?done=true');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(1);
  });

  it('GET /tasks?search= matches on the title (case-insensitive)', async () => {
    const res = await request(app).get('/tasks?search=readme');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Read the README');
  });

  it('GET /tasks?done=maybe is a client error (400)', async () => {
    await request(app).get('/tasks?done=maybe').expect(400);
  });

  it('GET /stats counts done vs not-done with SQL', async () => {
    await request(app).put('/tasks/1').send({ done: true });
    const res = await request(app).get('/stats');
    expect(res.body).toEqual({ total: 3, done: 1, notDone: 2 });
  });
});
