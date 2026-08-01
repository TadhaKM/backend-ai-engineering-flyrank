// db.js — the data-access layer. THE ONLY FILE THAT KNOWS SQL EXISTS.
//
// This is the whole point of the assignment. The routes above this file talk to
// a small set of plain functions (`list`, `getById`, `create`, …). They never see
// a SQL string, never know the database is SQLite, and would not change one line
// if this were swapped for Postgres. That separation — API on one side, storage on
// the other — is the lesson.
//
// Two exports:
//   openDatabase(file)   opens the file, creates the table, seeds it once
//   createTaskStore(db)  returns the CRUD functions the routes call

import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Opening the database
// ---------------------------------------------------------------------------

/**
 * Open (or create) the SQLite database at `file`, ensure the schema exists, and
 * seed three example tasks the very first time. Returns the live connection.
 *
 * `better-sqlite3` is synchronous: every call blocks until SQLite answers. For a
 * single-file database on local disk that is both simpler and faster than the
 * callback/promise dance — there is no network round-trip to wait on.
 */
export function openDatabase(file) {
  const db = new Database(file);

  // WAL (write-ahead logging) lets reads happen while a write is in progress and
  // survives a crash mid-write. It creates two sidecar files (`-wal`, `-shm`)
  // next to the database — that is normal, and they are git-ignored.
  db.pragma('journal_mode = WAL');
  // Enforce declared constraints (NOT NULL, etc). SQLite leaves some off by default.
  db.pragma('foreign_keys = ON');

  migrate(db);
  seedIfEmpty(db);
  return db;
}

/**
 * Create the `tasks` table if it does not already exist.
 *
 * `IF NOT EXISTS` is what makes this safe to run on every single startup: the
 * first run builds the table, every run after that is a no-op. That is why the
 * project needs no separate "set up the database" step.
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY,           -- auto-assigned, 1, 2, 3, …
      title      TEXT    NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0,    -- SQLite has no BOOLEAN; 0 = false, 1 = true
      created_at TEXT    NOT NULL,              -- ISO-8601 UTC
      updated_at TEXT    NOT NULL
    );
  `);
}

/**
 * Insert three example tasks — but ONLY if the table is empty.
 *
 * The empty-check is what stops the seed data from piling up. Without it, every
 * restart would add three more rows and the list would grow forever. With it,
 * the examples appear exactly once, on the first run of a fresh database.
 */
function seedIfEmpty(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();
  if (count > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(
    'INSERT INTO tasks (title, done, created_at, updated_at) VALUES (?, ?, ?, ?)',
  );

  // A transaction: all three inserts commit together, or none do. Overkill for
  // seed data, but it is the right habit and better-sqlite3 makes it a one-liner.
  const insertMany = db.transaction((titles) => {
    for (const title of titles) insert.run(title, 0, now, now);
  });

  insertMany(['Read the README', 'Start the server', 'Learn some SQL']);
}

// ---------------------------------------------------------------------------
// The store — the functions the routes actually call
// ---------------------------------------------------------------------------

/**
 * Build the task store over an open database connection.
 *
 * Statements are "prepared" once, here, and reused. A prepared statement is
 * parsed and planned by SQLite a single time; running it is then just supplying
 * the `?` values. It is faster, and — the reason that actually matters — the
 * values can never be interpreted as SQL. That is how this layer is immune to
 * SQL injection: user input is always data bound to a `?`, never spliced into
 * the query text.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function createTaskStore(db) {
  const statements = {
    byId: db.prepare('SELECT * FROM tasks WHERE id = ?'),
    insert: db.prepare(
      'INSERT INTO tasks (title, done, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ),
    update: db.prepare('UPDATE tasks SET title = ?, done = ?, updated_at = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM tasks WHERE id = ?'),
    stats: db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS done FROM tasks'),
  };

  return {
    /**
     * Every task, optionally filtered. `ORDER BY id` keeps the list stable.
     *
     * The WHERE clause is built up from whichever filters were passed, but the
     * VALUES are still bound to `?` placeholders — never string-concatenated.
     * This is the "★ search / filter / sort" extras and the read side, in one place.
     *
     * @param {{ done?: boolean, search?: string, sort?: 'title' }} [filters]
     */
    list(filters = {}) {
      const where = [];
      const params = [];

      if (filters.done !== undefined) {
        where.push('done = ?');
        params.push(filters.done ? 1 : 0);
      }
      if (filters.search !== undefined) {
        // LIKE with %…% is a substring match; it is case-insensitive for ASCII
        // in SQLite by default.
        where.push('title LIKE ?');
        params.push(`%${filters.search}%`);
      }

      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      // `sort` is not user text — it is one of a fixed set of options mapped to a
      // known SQL fragment here, so it never touches the query as raw input.
      // COLLATE NOCASE makes the alphabetical sort case-insensitive; the id
      // tiebreak keeps the order stable when two titles match.
      const order = filters.sort === 'title' ? 'ORDER BY title COLLATE NOCASE, id' : 'ORDER BY id';
      const rows = db.prepare(`SELECT * FROM tasks ${clause} ${order}`).all(...params);
      return rows.map(toTask);
    },

    /** One task by id, or `null` if there is no such row. */
    getById(id) {
      const row = statements.byId.get(id);
      return row ? toTask(row) : null;
    },

    /**
     * Insert a task and return the freshly-created row (so the caller gets the
     * database-assigned id and timestamps back).
     *
     * @param {{ title: string, done?: boolean }} input
     */
    create({ title, done = false }) {
      const now = new Date().toISOString();
      const info = statements.insert.run(title, done ? 1 : 0, now, now);
      return this.getById(info.lastInsertRowid);
    },

    /**
     * Update the provided fields of a task. A field left out is kept as-is, so
     * `{ done: true }` flips only `done` and leaves the title alone.
     *
     * Returns the updated task, or `null` if no task has that id.
     *
     * @param {number} id
     * @param {{ title?: string, done?: boolean }} changes
     */
    update(id, changes) {
      const existing = statements.byId.get(id);
      if (!existing) return null;

      const title = changes.title !== undefined ? changes.title : existing.title;
      const done = changes.done !== undefined ? (changes.done ? 1 : 0) : existing.done;
      const now = new Date().toISOString();

      statements.update.run(title, done, now, id);
      return this.getById(id);
    },

    /** Delete a task. Returns `true` if a row was actually removed. */
    remove(id) {
      return statements.remove.run(id).changes > 0;
    },

    /** Counts, computed by SQL rather than in JavaScript — the "★ statistics" extra. */
    stats() {
      const { total, done } = statements.stats.get();
      return { total, done, notDone: total - done };
    },
  };
}

/**
 * Translate a raw database row into the shape the API returns.
 *
 * The one job that matters here: `done` is stored as 0/1 (SQLite has no boolean)
 * but the API has always returned a real `true`/`false`. Converting it here, in
 * the one place rows leave the storage layer, means the routes and their clients
 * never see the 0/1 representation. The API contract is preserved by this single
 * `Boolean(...)`.
 */
function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    done: Boolean(row.done),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
