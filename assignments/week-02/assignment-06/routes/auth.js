// routes/auth.js
//
// The open gates and the exit: signup, login, logout. These talk to Supabase
// (through the injected `auth` service) and never touch the protected data.
//
//   POST /auth/signup   create an account
//   POST /auth/login    exchange credentials for a JWT
//   POST /auth/logout   end the session  (protected — uses requireAuth)

import { Router } from 'express';

/**
 * @param {import('../authService.js').AuthService} auth
 * @param {import('express').RequestHandler} requireAuth
 */
export function createAuthRouter(auth, requireAuth) {
  const router = Router();

  // POST /auth/signup — body: { email, password }
  router.post('/auth/signup', async (req, res) => {
    const { email, password } = req.body ?? {};

    // Validate before calling Supabase. Missing input is the client's mistake.
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { data, error } = await auth.signUp(email, password);
    if (error) {
      // e.g. weak password, already-registered email — Supabase says why.
      return res.status(400).json({ error: error.message });
    }

    // 201 Created, with the user Supabase created. (Depending on the project's
    // settings, the user may need to confirm their email before they can log in.)
    return res.status(201).json({ user: data.user });
  });

  // POST /auth/login — body: { email, password }
  router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { data, error } = await auth.login(email, password);
    if (error || !data?.session) {
      // One vague message for every auth failure (wrong password, unknown email,
      // unconfirmed account). Telling them which would leak who has an account.
      return res.status(401).json({ error: 'Invalid login credentials' });
    }

    // 200 OK with the tokens Supabase issued. The client stores the access token
    // and sends it back as `Authorization: Bearer <token>` on protected routes.
    return res.status(200).json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user,
    });
  });

  // POST /auth/logout — protected. Ends the session, replies 204.
  router.post('/auth/logout', requireAuth, async (req, res) => {
    // Best-effort: revoke the session in Supabase. Even if this fails, a JWT is
    // stateless and expires on its own, so we still report success and expect the
    // client to drop the token.
    try {
      await auth.logout(req.token);
    } catch {
      /* ignore — see the note in authService.logout */
    }
    // 204 No Content — success, nothing to send back.
    return res.status(204).end();
  });

  return router;
}
