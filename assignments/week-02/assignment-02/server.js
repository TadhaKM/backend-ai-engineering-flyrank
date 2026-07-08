// server.js — the entry point. Start it with:  node server.js
//
// This file does four things and nothing else:
//   1. load configuration
//   2. create the Express app
//   3. attach the routes (public, auth, protected)
//   4. start listening
//
// The actual logic lives in routes/ and middleware/.

import dotenv from 'dotenv'; // reads the .env file into process.env
import express from 'express'; // the web framework
import authRoutes from './routes/auth.js'; // POST /register, POST /login
import { authenticateToken } from './middleware/auth.js'; // the JWT gatekeeper

// Load .env into process.env.
// Heads-up: in ES modules every `import` above runs BEFORE this line does. That's
// why routes/ and middleware/ read process.env inside their functions rather than
// at the top of their files — at import time, .env hasn't been read yet.
dotenv.config({ quiet: true });

// Fail fast. Starting without a secret would mean signing tokens with `undefined`,
// so anyone could forge a login. Better to refuse to boot than to boot insecurely.
if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET. Copy .env.example to .env and set a value.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON bodies and put the result on `req.body`.
// Without this, req.body would be undefined and /register could not read the password.
app.use(express.json());

// ---------------------------------------------------------------------------
// PUBLIC route — no token needed. Anyone can call this.
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({ message: 'Public route — anyone can see this.' });
});

// ---------------------------------------------------------------------------
// AUTH routes — POST /register and POST /login, defined in routes/auth.js
// ---------------------------------------------------------------------------
app.use(authRoutes);

// ---------------------------------------------------------------------------
// PROTECTED route.
// Express runs the functions left to right: authenticateToken first, then the
// handler. If the token is bad, the middleware replies with 401/403 and never
// calls next(), so the handler below simply never runs.
// ---------------------------------------------------------------------------
app.get('/profile', authenticateToken, (req, res) => {
  // req.user was attached by the middleware after it verified the token.
  res.json({
    message: 'You are authenticated!',
    user: { username: req.user.username },
  });
});

// ---------------------------------------------------------------------------
// Error handler (must be last, and must take 4 arguments so Express recognises it).
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
  console.log(`Server running at http://localhost:${PORT}`);
});
