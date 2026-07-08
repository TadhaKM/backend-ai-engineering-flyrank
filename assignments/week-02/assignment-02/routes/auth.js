// routes/auth.js
//
// The two endpoints that create and authenticate users:
//   POST /register  -> make a new account
//   POST /login     -> exchange username+password for a JWT
//
// A "Router" is a mini Express app. We define routes on it here, and server.js
// plugs it into the real app. This keeps server.js short and each file focused.

import { Router } from 'express';
import bcrypt from 'bcrypt'; // hashes passwords (slow on purpose — see README)
import jwt from 'jsonwebtoken'; // creates the signed login token
import { randomUUID } from 'node:crypto'; // built into Node — no `uuid` package needed

const router = Router();

// Our "database": a plain array that lives in memory.
// Everything in here disappears when the server restarts. That's fine for now —
// swapping this for a real database later shouldn't change the routes much.
const users = [];

// How much work bcrypt does per hash. Higher = slower = harder to brute-force.
// 10 is a sensible default (~50–100ms per hash).
const SALT_ROUNDS = 10;

// How long a login token stays valid. See README: tokens must expire.
const TOKEN_LIFETIME = '1h';

// A throwaway hash used only to keep login timing constant. See the login route.
const DUMMY_HASH = bcrypt.hashSync('a-password-nobody-has', SALT_ROUNDS);

/**
 * POST /register
 * Body: { "username": "alice", "password": "password123" }
 */
router.post('/register', async (req, res) => {
  // `req.body` only exists because server.js installed express.json().
  const { username, password } = req.body ?? {};

  // 1. VALIDATE. Never trust what the client sends.
  //    400 Bad Request = "your input is wrong, don't retry unchanged".
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (username.trim() === '') {
    return res.status(400).json({ error: 'username cannot be empty' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  // 2. REJECT DUPLICATES.
  //    409 Conflict = "your input is valid, but it clashes with existing state".
  if (users.some((u) => u.username === username)) {
    return res.status(409).json({ error: 'username already exists' });
  }

  // 3. HASH THE PASSWORD. We never keep the plain text — not in a variable we
  //    store, not in a log, nowhere. Only this one-way hash gets saved.
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = { id: randomUUID(), username, passwordHash };
  users.push(user);

  // 4. RESPOND. 201 Created = "a new resource now exists".
  //    Notice we return the id and username but NEVER the hash.
  return res.status(201).json({ id: user.id, username: user.username });
});

/**
 * POST /login
 * Body: { "username": "alice", "password": "password123" }
 * Returns: { "token": "<jwt>" }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required' });
  }

  // 1. FIND THE USER.
  const user = users.find((u) => u.username === username);

  // 2. COMPARE THE PASSWORD.
  //    bcrypt.compare() re-hashes the submitted password with the same salt that
  //    is baked into the stored hash, then checks whether the results match.
  //    We can't "un-hash" the stored value — hashing only goes one way.
  //
  //    If the username doesn't exist we still run a comparison against a dummy
  //    hash. Otherwise we'd reply noticeably faster for unknown usernames, and
  //    an attacker could use that timing difference to discover who has accounts.
  const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  // 3. REJECT BAD CREDENTIALS.
  //    One vague message for both "no such user" and "wrong password" — telling
  //    them which one was wrong would confirm that a username exists.
  //    401 Unauthorized = "these credentials are not valid".
  if (!user || !passwordMatches) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // 4. ISSUE A TOKEN.
  //    jwt.sign() packs the payload into a string and signs it with our secret.
  //    The payload is only ENCODED (base64), not encrypted — anyone can read it.
  //    So: never put a password or anything sensitive inside a JWT.
  //    `sub` ("subject") is the standard field for "who this token is about".
  const token = jwt.sign({ sub: user.id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_LIFETIME,
  });

  // 200 OK = "here is what you asked for".
  return res.json({ token });
});

export default router;
