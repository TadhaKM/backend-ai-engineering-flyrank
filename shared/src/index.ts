/**
 * `@flyrank/shared` — the public surface of the shared workspace.
 *
 * Import from the package root in any assignment:
 *
 *   import { createLogger, requireEnv, ok, err } from '@flyrank/shared';
 *
 * Only add genuinely reusable building blocks here. Assignment-specific code
 * belongs in that assignment, never in `shared/`.
 */

export * from './errors.ts';
export * from './env.ts';
export * from './logger.ts';
export * from './result.ts';
