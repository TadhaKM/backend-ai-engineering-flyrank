// middleware/requireAuth.js
//
// The guard at every locked door. It answers one question — "is this request
// carrying a valid Supabase access token?" — and runs BEFORE the route handler.
// If the token is good it attaches the user to the request and calls next();
// otherwise it replies 401 and the handler never runs.
//
// It is a FACTORY: it takes the auth service and returns the middleware. That is
// what lets the tests hand it a fake `auth` and drive every branch without a real
// Supabase project (mirrors how assignment-03 injects its repository).

/**
 * @param {import('../authService.js').AuthService} auth
 */
export function createRequireAuth(auth) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization;

    // No header, or not "Bearer <token>" — the client never presented a pass.
    // The brief is specific about this message.
    if (!header) {
      return res.status(401).json({ error: 'Access token required' });
    }
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Ask Supabase whether the token is genuine and unexpired. A network failure
    // (or a thrown error) is treated the same as a rejection: no valid user, 401.
    let result;
    try {
      result = await auth.getUser(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data, error } = result ?? {};
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // The pass checks out. Hang the user (and the raw token, for logout) on the
    // request so the handler downstream can use them.
    req.user = data.user;
    req.token = token;
    next();
  };
}
