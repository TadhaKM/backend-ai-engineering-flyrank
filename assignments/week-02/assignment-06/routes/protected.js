// routes/protected.js
//
// The rooms behind the guard. Every route here is wrapped in `requireAuth`, so
// the handler only ever runs for a request that already proved it has a valid
// token. By the time we get here, `req.user` is the verified Supabase user.
//
//   GET /protected/profile     the caller's own account details
//   GET /protected/dashboard   a second protected route (Stage 4 checkpoint)

import { Router } from 'express';

/**
 * @param {import('express').RequestHandler} requireAuth
 */
export function createProtectedRouter(requireAuth) {
  const router = Router();

  // Apply the guard to every route on this router in one line, so it can never
  // be forgotten on a new endpoint added later. This router is mounted under
  // `/protected` in app.js, so the guard is scoped to those paths only — it must
  // NOT be mounted at `/`, or it would intercept every other route (Swagger, the
  // public route, the 404 handler…).
  router.use(requireAuth);

  // GET /protected/profile — the verified user's secure metadata.
  router.get('/profile', (req, res) => {
    const { id, email, created_at } = req.user;
    return res.status(200).json({ id, email, created_at });
  });

  // GET /protected/dashboard — proves the same middleware guards new routes too.
  router.get('/dashboard', (req, res) => {
    return res.status(200).json({
      message: `Welcome, ${req.user.email}. This is your private dashboard.`,
      userId: req.user.id,
    });
  });

  return router;
}
