// server.js — the entry point. Start it with:  node server.js
//
// Same shape as Assignment 02, plus two things:
//   * it builds a UserRepository and injects it into the routes
//   * it closes the database pool cleanly on shutdown

import dotenv from 'dotenv';
import express from 'express';
import createAuthRouter from './routes/auth.js';
import { authenticateToken } from './middleware/auth.js';
import { createUserRepository } from './repositories/index.js';

dotenv.config({ quiet: true });

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET. Copy .env.example to .env and set a value.');
  process.exit(1);
}

// Build the repository BEFORE the server accepts traffic. If the database is
// unreachable we stop here rather than starting up and serving 500s.
// (Top-level `await` is allowed in ES modules.)
let users;
try {
  users = await createUserRepository();
} catch (err) {
  // The single most common failure: STORAGE=postgres but nothing is listening.
  // A clear sentence beats a 40-line stack trace.
  // AggregateError (what pg throws on a refused connection) has an empty .message.
  console.error(`Could not start: ${err.message || err.code || err}`);
  if (err.code === 'ECONNREFUSED' || String(err).includes('ECONNREFUSED')) {
    console.error('The database refused the connection. Is it running?');
    console.error('  docker compose up -d db      # start Postgres');
    console.error('  STORAGE=memory node server.js  # or run without a database');
  }
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- PUBLIC ----------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({ message: 'Public route — anyone can see this.' });
});

/**
 * GET /health — is the app actually able to reach its dependencies?
 * More useful than "the process is running": it proves the database answers.
 */
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    storage: process.env.STORAGE ?? 'postgres',
    users: null,
    redis: 'not configured',
  };

  try {
    health.users = await users.count(); // a real query against the real store
  } catch (err) {
    health.status = 'degraded';
    health.database = err.message;
  }

  // Optional (stretch): Redis is in docker-compose ready for later weeks.
  // Imported lazily so the app runs fine when REDIS_URL is unset.
  if (process.env.REDIS_URL) {
    try {
      const { createClient } = await import('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      health.redis = await client.ping(); // -> "PONG"
      await client.quit();
    } catch {
      health.redis = 'unreachable';
      health.status = 'degraded';
    }
  }

  return res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// --- AUTH ------------------------------------------------------------------
// The router is a factory now: we hand it the repository it should use.
app.use(createAuthRouter(users));

// --- PROTECTED -------------------------------------------------------------
app.get('/profile', authenticateToken, (req, res) => {
  res.json({
    message: 'You are authenticated!',
    user: { username: req.user.username },
  });
});

// --- ERRORS ----------------------------------------------------------------
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(
    `Server running at http://localhost:${PORT} (storage: ${process.env.STORAGE ?? 'postgres'})`,
  );
});

// Close the HTTP server and the database pool on Ctrl+C / `docker compose down`.
// Without this, Postgres keeps the connections open until they time out.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await users.close();
      process.exit(0);
    });
  });
}
