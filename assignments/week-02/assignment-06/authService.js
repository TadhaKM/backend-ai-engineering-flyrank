// authService.js
//
// THE ONLY FILE THAT KNOWS @supabase/supabase-js EXISTS.
//
// This is the same seam idea as assignment-03's repository: everything above it
// depends on a tiny four-method interface (signUp, login, getUser, logout), not
// on Supabase. That is what lets the tests inject a fake and verify every status
// code without a real Supabase project or a network connection.
//
// Why delegate to Supabase at all? Because rolling your own password hashing and
// token signing (assignment-02 does exactly that, on purpose) is discouraged in
// production. Here Supabase is the Identity Provider: it stores users, hashes
// passwords, and issues + verifies the JWTs. Our server's job is only to call it
// and to guard the protected doors.

import { createClient } from '@supabase/supabase-js';

/**
 * Build the auth adapter over a real Supabase project.
 *
 * @param {string} url  SUPABASE_URL
 * @param {string} key  SUPABASE_KEY (the anon key)
 * @returns {AuthService}
 */
export function createSupabaseAuth(url, key) {
  // persistSession/autoRefreshToken off: this is a stateless server, not a
  // browser. We never want the SDK writing a session to disk or refreshing one
  // in the background — each request carries its own token.
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const supabase = createClient(url, key, options);

  return {
    /** Register a new user. Resolves to Supabase's `{ data, error }`. */
    signUp(email, password) {
      return supabase.auth.signUp({ email, password });
    },

    /** Exchange email + password for a session (access + refresh token). */
    login(email, password) {
      return supabase.auth.signInWithPassword({ email, password });
    },

    /** Verify an access token and return the user it belongs to. */
    getUser(token) {
      return supabase.auth.getUser(token);
    },

    /**
     * Sign a specific user's token out.
     *
     * Note: the brief writes `supabase.auth.signOut(token)`, but the real v2 API
     * signs out the client's *current* session — and on a stateless server there
     * isn't one. The correct server-side move with the anon key is to act AS the
     * user (attach their bearer token) and then sign out, which revokes that
     * session's refresh token in Supabase. The access token itself is a stateless
     * JWT and stays valid until it expires; the client is expected to discard it.
     */
    logout(token) {
      const scoped = createClient(url, key, {
        ...options,
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      return scoped.auth.signOut();
    },
  };
}

/**
 * @typedef {object} AuthService
 * @property {(email: string, password: string) => Promise<{data: any, error: any}>} signUp
 * @property {(email: string, password: string) => Promise<{data: any, error: any}>} login
 * @property {(token: string) => Promise<{data: any, error: any}>} getUser
 * @property {(token: string) => Promise<{error: any}>} logout
 */
