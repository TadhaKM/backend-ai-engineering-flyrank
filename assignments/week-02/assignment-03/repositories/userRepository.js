// repositories/userRepository.js
//
// THE CONTRACT.
//
// This file contains no storage code at all. It only says what a "user
// repository" must be able to do. Both the in-memory version and the Postgres
// version implement exactly this, which is what lets us swap one for the other
// without touching the routes.
//
// The routes ask for "find me a user by username". They never learn whether the
// answer came from an array or from a SQL query — and that ignorance is the point.

/**
 * A user, as the rest of the app sees it. Note `passwordHash` (camelCase) —
 * the Postgres column is `password_hash`, and translating it is the repository's
 * job, not the route's.
 *
 * @typedef  {object} User
 * @property {string} id
 * @property {string} username
 * @property {string} passwordHash
 */

/**
 * @typedef  {object} UserRepository
 * @property {() => Promise<void>}                    init            Prepare storage (create tables, etc). Safe to call twice.
 * @property {(username: string) => Promise<User|null>} findByUsername Null when nobody has that username.
 * @property {(user: User) => Promise<User>}          create          Throws DuplicateUsernameError if taken.
 * @property {() => Promise<number>}                  count           How many users exist (used by /health and the persistence proof).
 * @property {() => Promise<void>}                    close           Release connections on shutdown.
 */

/** Thrown by `create` when the username is already taken. Routes map this to 409. */
export class DuplicateUsernameError extends Error {
  constructor(username) {
    super(`username already exists: ${username}`);
    this.name = 'DuplicateUsernameError';
  }
}

/** Every method a UserRepository must provide. */
export const USER_REPOSITORY_METHODS = ['init', 'findByUsername', 'create', 'count', 'close'];

/**
 * Fail loudly if a backend doesn't implement the whole contract.
 * Cheap insurance: without it, a missing method would only surface as a
 * confusing 500 on some rarely-hit route.
 *
 * @param {unknown} repo
 * @returns {UserRepository}
 */
export function assertIsUserRepository(repo) {
  const missing = USER_REPOSITORY_METHODS.filter((m) => typeof repo?.[m] !== 'function');
  if (missing.length > 0) {
    throw new Error(`Not a UserRepository — missing method(s): ${missing.join(', ')}`);
  }
  return repo;
}
