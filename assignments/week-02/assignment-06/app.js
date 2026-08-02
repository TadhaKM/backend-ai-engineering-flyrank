// app.js — assembles the Express app given an auth service.
//
// Kept separate from server.js so the tests can build an app over a FAKE auth
// service and drive every route in-process, with no port, no network, and no
// real Supabase project. server.js is the only place a real Supabase client is
// created. See tests/auth.test.js.

import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { readFile } from 'node:fs/promises';
import { createRequireAuth } from './middleware/requireAuth.js';
import { createAuthRouter } from './routes/auth.js';
import { createProtectedRouter } from './routes/protected.js';

// The OpenAPI description Swagger UI renders, loaded once at import.
const openapi = JSON.parse(await readFile(new URL('./openapi.json', import.meta.url), 'utf-8'));

/**
 * @param {{ auth: import('./authService.js').AuthService }} deps
 */
export function createApp({ auth }) {
  const app = express();
  app.use(express.json());

  const requireAuth = createRequireAuth(auth);

  // A friendly index pointing at the docs.
  app.get('/', (req, res) => {
    res.json({
      name: 'Supabase Auth API',
      docs: '/docs',
      endpoints: [
        'POST /auth/signup',
        'POST /auth/login',
        'POST /auth/logout',
        'GET /protected/profile',
        'GET /protected/dashboard',
        'GET /public/info',
      ],
    });
  });

  // The one open door — no token needed.
  app.get('/public/info', (req, res) => {
    res.status(200).json({ message: 'Welcome stranger! This info is public.' });
  });

  app.use(createAuthRouter(auth, requireAuth));
  // Mounted UNDER /protected so its blanket requireAuth guard is scoped to those
  // paths and cannot leak onto Swagger or the public route.
  app.use('/protected', createProtectedRouter(requireAuth));

  // Swagger UI at /docs, with the "Authorize" padlock wired to the bearer scheme.
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  // Unknown route -> JSON 404 (not Express's default HTML).
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler (last, four args). Keeps a malformed JSON body as a 400 JSON.
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Request body is not valid JSON' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
