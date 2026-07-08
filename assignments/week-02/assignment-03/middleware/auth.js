// middleware/auth.js
//
// Middleware is just a function that runs BEFORE your route handler.
// It gets the same (req, res) objects, plus `next` — a function that means
// "I'm done, carry on to the next thing". If middleware never calls next(),
// the route handler never runs.
//
// This middleware answers one question: "is this request carrying a valid
// login token?"  If yes -> let it through.  If no -> reply with an error.

import jwt from 'jsonwebtoken'; // library that creates and verifies JWTs

export function authenticateToken(req, res, next) {
  // STEP 1 — Read the Authorization header sent by the client.
  // We expect it to look exactly like:   Authorization: Bearer <token>
  const authHeader = req.headers.authorization;

  // STEP 2 — No header at all? The client never sent credentials.
  // 401 Unauthorized = "you have not identified yourself".
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  // STEP 3 — Split "Bearer <token>" on the space into its two parts.
  // A malformed header is still a *missing* credential, so it is also a 401.
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Expected "Authorization: Bearer <token>"' });
  }

  // STEP 4 — Verify the token.
  // jwt.verify() checks two things and throws if either fails:
  //   a) the signature — proves WE created this token and nobody edited it
  //   b) the expiry    — proves the token is still within its lifetime
  //
  // We read the secret here (inside the function) rather than at the top of the
  // file. In ES modules every `import` runs before any other code, so at the top
  // of this file dotenv would not have loaded .env yet and the secret would be
  // undefined.
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // STEP 5 — The token is good. Hang the user onto the request so the route
    // handler further down the line can use it.
    req.user = { id: payload.sub, username: payload.username };

    // STEP 6 — Hand control to the next function (the route handler).
    next();
  } catch {
    // The client DID send a token, it just isn't usable — forged, corrupted,
    // or past its expiry. 403 Forbidden = "I know who you claim to be, but no".
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
