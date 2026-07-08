// repositories/inMemoryUserRepository.js
//
// Assignment 02's storage, now hidden behind the UserRepository contract.
// It is still just an array — but the routes can no longer see that.
//
// Everything here is `async` even though nothing awaits. That is deliberate:
// the Postgres version *must* be async, so the contract is async, so this one is
// too. If the contract were sync, swapping in a database would break every caller.

import { DuplicateUsernameError } from './userRepository.js';

/** @returns {import('./userRepository.js').UserRepository} */
export function createInMemoryUserRepository() {
  /** @type {import('./userRepository.js').User[]} */
  const users = [];

  return {
    async init() {
      // Nothing to prepare — the array already exists.
    },

    async findByUsername(username) {
      return users.find((u) => u.username === username) ?? null;
    },

    async create(user) {
      if (users.some((u) => u.username === user.username)) {
        throw new DuplicateUsernameError(user.username);
      }
      users.push(user);
      return user;
    },

    async count() {
      return users.length;
    },

    async close() {
      // No connections to release.
    },
  };
}
