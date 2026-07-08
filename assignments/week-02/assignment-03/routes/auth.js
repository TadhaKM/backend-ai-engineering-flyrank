// routes/auth.js
//
// POST /register and POST /login — the same logic as Assignment 02.
//
// The ONE difference from A2: this file no longer owns `const users = []`.
// It receives a `users` repository and calls methods on it. It cannot tell whether
// those methods talk to an array or to Postgres, and it doesn't care.
//
// Because of that, swapping storage in A3 required changing zero lines below.

import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { DuplicateUsernameError } from '../repositories/userRepository.js';

const SALT_ROUNDS = 10;
const TOKEN_LIFETIME = '1h';

// A throwaway hash used only to keep login timing constant. See the login route.
const DUMMY_HASH = bcrypt.hashSync('a-password-nobody-has', SALT_ROUNDS);

/**
 * @param {import('../repositories/userRepository.js').UserRepository} users
 */
export default function createAuthRouter(users) {
  const router = Router();

  /**
   * POST /register
   * Body: { "username": "alice", "password": "password123" }
   */
  router.post('/register', async (req, res) => {
    const { username, password } = req.body ?? {};

    // 1. VALIDATE. Never trust what the client sends.
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'username and password are required' });
    }
    if (username.trim() === '') {
      return res.status(400).json({ error: 'username cannot be empty' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    // 2. REJECT DUPLICATES (the friendly check).
    if (await users.findByUsername(username)) {
      return res.status(409).json({ error: 'username already exists' });
    }

    // 3. HASH. The plain password never gets stored anywhere.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    try {
      const user = await users.create({ id: randomUUID(), username, passwordHash });
      // 201 Created — and never the hash in the response.
      return res.status(201).json({ id: user.id, username: user.username });
    } catch (err) {
      // The check in step 2 can lose a race: two requests can both find "no such
      // user" and then both INSERT. The database's UNIQUE constraint is what
      // actually guarantees uniqueness, and it surfaces here.
      if (err instanceof DuplicateUsernameError) {
        return res.status(409).json({ error: 'username already exists' });
      }
      throw err;
    }
  });

  /**
   * POST /login  ->  { "token": "<jwt>" }
   */
  router.post('/login', async (req, res) => {
    const { username, password } = req.body ?? {};

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = await users.findByUsername(username);

    // Always run a comparison — against a dummy hash when the user doesn't exist —
    // so response time doesn't reveal which usernames are registered.
    const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    // One vague message for both failure modes: saying which was wrong would
    // confirm that a username exists.
    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ sub: user.id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: TOKEN_LIFETIME,
    });

    return res.json({ token });
  });

  return router;
}
