/**
 * Shared error types.
 *
 * Assignments should throw these (or subclasses) instead of bare `Error`s so
 * that callers can branch on a stable, machine-readable `code`.
 */

/** Base class for all expected, application-level errors. */
export class AppError extends Error {
  /** Stable, machine-readable identifier, e.g. `CONFIG_MISSING_ENV`. */
  readonly code: string;
  /** Optional structured context for logs. */
  readonly context?: Record<string, unknown>;

  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    // Restore prototype chain for instanceof checks after transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when configuration or environment is missing or invalid. */
export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CONFIG_ERROR', message, context);
  }
}
