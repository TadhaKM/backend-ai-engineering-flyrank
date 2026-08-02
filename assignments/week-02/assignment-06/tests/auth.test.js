// tests/auth.test.js
//
// Drives the real Express app against a FAKE auth service — no Supabase project,
// no network, no credentials. The fake stands in for authService.js and returns
// canned Supabase-shaped `{ data, error }` objects, which lets these tests pin
// down the whole status-code contract the brief lists: 201 / 200 / 204 / 400 /
// 401. (The real Supabase calls themselves can only be exercised against a live
// project — see the README's honest verification note.)

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const VALID_TOKEN = 'valid-token';

const SUPABASE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'test@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
};

/** A stand-in for authService.js. Overridable per test. */
function fakeAuth(overrides = {}) {
  return {
    signUp: async () => ({ data: { user: SUPABASE_USER }, error: null }),
    login: async () => ({
      data: {
        user: SUPABASE_USER,
        session: { access_token: 'access-abc', refresh_token: 'refresh-xyz' },
      },
      error: null,
    }),
    getUser: async (token) =>
      token === VALID_TOKEN
        ? { data: { user: SUPABASE_USER }, error: null }
        : { data: { user: null }, error: { message: 'invalid token' } },
    logout: async () => ({ error: null }),
    ...overrides,
  };
}

const appWith = (overrides) => createApp({ auth: fakeAuth(overrides) });

describe('Supabase Auth API', () => {
  // --- public --------------------------------------------------------------

  it('GET /public/info is open and returns the welcome message', async () => {
    const res = await request(appWith()).get('/public/info');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Welcome stranger! This info is public.' });
  });

  // --- signup --------------------------------------------------------------

  it('POST /auth/signup returns 201 with the created user', async () => {
    const res = await request(appWith())
      .post('/auth/signup')
      .send({ email: 'test@example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'test@example.com' });
  });

  it('POST /auth/signup returns 400 when a field is missing', async () => {
    const res = await request(appWith()).post('/auth/signup').send({ email: 'x@y.com' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/signup returns 400 when Supabase rejects it', async () => {
    const app = appWith({
      signUp: async () => ({ data: {}, error: { message: 'User already registered' } }),
    });
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'test@example.com', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('User already registered');
  });

  // --- login ---------------------------------------------------------------

  it('POST /auth/login returns 200 with access + refresh tokens', async () => {
    const res = await request(appWith())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBe('access-abc');
    expect(res.body.refresh_token).toBe('refresh-xyz');
  });

  it('POST /auth/login returns 400 when a field is missing', async () => {
    const res = await request(appWith()).post('/auth/login').send({ password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/login returns 401 on bad credentials', async () => {
    const app = appWith({
      login: async () => ({ data: {}, error: { message: 'Invalid login credentials' } }),
    });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid login credentials' });
  });

  // --- protected: the guard ------------------------------------------------

  it('GET /protected/profile returns 401 when the header is missing', async () => {
    const res = await request(appWith()).get('/protected/profile');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Access token required' });
  });

  it('GET /protected/profile returns 401 when the header is malformed', async () => {
    const res = await request(appWith())
      .get('/protected/profile')
      .set('Authorization', 'Basic something');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Access token required' });
  });

  it('GET /protected/profile returns 401 for an invalid/expired token', async () => {
    const res = await request(appWith())
      .get('/protected/profile')
      .set('Authorization', 'Bearer tampered');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });

  it('GET /protected/profile returns 200 with user metadata for a valid token', async () => {
    const res = await request(appWith())
      .get('/protected/profile')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: SUPABASE_USER.id,
      email: SUPABASE_USER.email,
      created_at: SUPABASE_USER.created_at,
    });
  });

  // --- protected: the middleware guards a SECOND route too -----------------

  it('GET /protected/dashboard rejects an invalid token and permits a valid one', async () => {
    await request(appWith()).get('/protected/dashboard').expect(401);

    const ok = await request(appWith())
      .get('/protected/dashboard')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(ok.status).toBe(200);
    expect(ok.body.userId).toBe(SUPABASE_USER.id);
  });

  // --- logout --------------------------------------------------------------

  it('POST /auth/logout returns 401 without a token (it is protected)', async () => {
    const res = await request(appWith()).post('/auth/logout');
    expect(res.status).toBe(401);
  });

  it('POST /auth/logout returns 204 for a valid token', async () => {
    const res = await request(appWith())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('POST /auth/logout still returns 204 even if Supabase signOut throws', async () => {
    // A stateless JWT expires on its own, so a failed revoke is not a failed logout.
    const app = appWith({
      logout: async () => {
        throw new Error('network down');
      },
    });
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(204);
  });

  // --- swagger -------------------------------------------------------------

  it('GET /docs/ serves Swagger UI', async () => {
    const res = await request(appWith()).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Swagger UI');
  });
});
