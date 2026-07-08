// repositories/postgresUserRepository.js
//
// The same UserRepository contract, backed by a real Postgres database.
// Compare it to inMemoryUserRepository.js: same five methods, same inputs, same
// outputs. Only the inside changed. That's why routes/auth.js didn't have to.
//
// It takes a `db` — anything with `.query(sql, params) -> { rows }`. In the app
// that's a `pg.Pool`. Accepting the interface rather than constructing the Pool
// here means this file has no idea where the database lives, and can be exercised
// against any Postgres-compatible client.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuplicateUsernameError } from './userRepository.js';

// Read the schema from the SAME file docker-compose feeds to Postgres, so the two
// can never drift apart.
const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'init.sql');
const SCHEMA_SQL = readFileSync(SCHEMA_PATH, 'utf8');

/**
 * Postgres returns snake_case columns; the rest of the app speaks camelCase.
 * Translating here keeps that detail from leaking into the routes.
 */
function toUser(row) {
  return { id: row.id, username: row.username, passwordHash: row.password_hash };
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>, end?: () => Promise<void> }} db
 * @returns {import('./userRepository.js').UserRepository}
 */
export function createPostgresUserRepository(db) {
  return {
    async init() {
      // Run the schema one statement at a time: some Postgres clients only accept
      // a single statement per query(). Strip `--` comments FIRST — otherwise a
      // statement preceded by a comment block ends up in a chunk that starts with
      // `--`, and naive filtering would silently throw the statement away.
      //
      // Safe here because our schema is plain DDL with no `;` or `--` inside string
      // literals. A real project would use a migration tool rather than this.
      const statements = SCHEMA_SQL.replace(/--[^\n]*/g, '')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await db.query(statement);
      }
    },

    async findByUsername(username) {
      // $1 is a bound parameter, NOT string concatenation. The database receives
      // the query and the value separately, so a username like  '; DROP TABLE users --
      // is treated as text, never as SQL. This is how you avoid SQL injection.
      const { rows } = await db.query(
        'SELECT id, username, password_hash FROM users WHERE username = $1',
        [username],
      );
      return rows[0] ? toUser(rows[0]) : null;
    },

    async create(user) {
      try {
        const { rows } = await db.query(
          `INSERT INTO users (id, username, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, username, password_hash`,
          [user.id, user.username, user.passwordHash],
        );
        return toUser(rows[0]);
      } catch (err) {
        // 23505 = unique_violation. The UNIQUE constraint on `username` is the real
        // guard against duplicates: two simultaneous requests could both pass the
        // "does this username exist?" check, but only one INSERT can win.
        if (err?.code === '23505') {
          throw new DuplicateUsernameError(user.username);
        }
        throw err;
      }
    },

    async count() {
      // ::int casts Postgres' bigint COUNT to a plain JS number.
      const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
      return rows[0].n;
    },

    async close() {
      // pg.Pool has .end(); simpler clients may not.
      if (typeof db.end === 'function') await db.end();
    },
  };
}
