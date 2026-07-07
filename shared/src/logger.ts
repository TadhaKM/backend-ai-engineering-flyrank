/**
 * A tiny, zero-dependency structured logger.
 *
 * Emits one JSON object per line — friendly for local reading and for log
 * aggregators alike. Level is controlled per-logger or via the `LOG_LEVEL`
 * environment variable (defaults to `info`).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  /** Namespace shown on every line, e.g. the assignment or module name. */
  name?: string;
  /** Minimum level to emit. Defaults to `LOG_LEVEL` env or `info`. */
  level?: LogLevel;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  /** Derive a sub-logger with a nested namespace (`parent:child`). */
  child(name: string): Logger;
}

function resolveDefaultLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL?.toLowerCase();
  if (fromEnv === 'debug' || fromEnv === 'info' || fromEnv === 'warn' || fromEnv === 'error') {
    return fromEnv;
  }
  return 'info';
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const name = options.name;
  const level = options.level ?? resolveDefaultLevel();
  const threshold = LEVEL_WEIGHT[level];

  function emit(lineLevel: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[lineLevel] < threshold) return;
    const record = {
      time: new Date().toISOString(),
      level: lineLevel,
      ...(name ? { name } : {}),
      message,
      ...(meta ? { meta } : {}),
    };
    const line = JSON.stringify(record);
    // Route warnings/errors to stderr so they survive stdout piping.
    if (lineLevel === 'error' || lineLevel === 'warn') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  return {
    debug: (message, meta) => emit('debug', message, meta),
    info: (message, meta) => emit('info', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    error: (message, meta) => emit('error', message, meta),
    child: (childName) => createLogger({ name: name ? `${name}:${childName}` : childName, level }),
  };
}

/** A ready-to-use default logger. Prefer `createLogger({ name })` in real code. */
export const logger: Logger = createLogger();
