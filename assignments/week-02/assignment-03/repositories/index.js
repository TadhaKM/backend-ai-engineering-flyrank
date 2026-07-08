// repositories/index.js
//
// THE SWAP POINT. This is the only file that knows both backends exist.
//
// Everything above it (server.js, routes/, middleware/) depends on the
// UserRepository *contract*, never on a concrete implementation. So changing
// where users are stored means changing this file — or, as set up here, just
// flipping the STORAGE environment variable. No route, no handler, no middleware.

import pg from 'pg';
import { createInMemoryUserRepository } from './inMemoryUserRepository.js';
import { createPostgresUserRepository } from './postgresUserRepository.js';
import { assertIsUserRepository } from './userRepository.js';

/**
 * Build the repository the app will use, based on configuration.
 * @returns {Promise<import('./userRepository.js').UserRepository>}
 */
export async function createUserRepository() {
  const storage = process.env.STORAGE ?? 'postgres';

  let repository;

  if (storage === 'memory') {
    // Assignment 02's behaviour. Handy for tests: no database required.
    repository = createInMemoryUserRepository();
  } else if (storage === 'postgres') {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required when STORAGE=postgres');
    }
    // A Pool keeps a small set of reusable connections rather than opening a new
    // one per query — connecting to Postgres is expensive.
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    repository = createPostgresUserRepository(pool);
  } else {
    throw new Error(`Unknown STORAGE "${storage}". Use "postgres" or "memory".`);
  }

  // Prove, at boot, that whichever backend we picked really does implement the
  // whole contract. A missing method fails here instead of as a mystery 500 later.
  assertIsUserRepository(repository);

  await repository.init();
  return repository;
}
