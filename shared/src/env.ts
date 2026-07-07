/**
 * Small, dependency-free helpers for reading environment variables in a typed,
 * fail-fast way. Load your `.env` file however you like (e.g. Node's built-in
 * `--env-file`, or `dotenv`) before calling these.
 */
import { ConfigError } from './errors.ts';

/** Read a required variable. Throws {@link ConfigError} if unset or empty. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new ConfigError(`Missing required environment variable: ${name}`, { name });
  }
  return value;
}

/** Read an optional variable, returning `fallback` (or `undefined`) if unset. */
export function getEnv(name: string): string | undefined;
export function getEnv(name: string, fallback: string): string;
export function getEnv(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

/** Read a numeric variable. Throws if present but not a finite number. */
export function envNumber(name: string, fallback?: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    if (fallback !== undefined) return fallback;
    throw new ConfigError(`Missing required numeric environment variable: ${name}`, { name });
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new ConfigError(`Environment variable ${name} is not a valid number: "${raw}"`, {
      name,
      raw,
    });
  }
  return parsed;
}

/** Read a boolean variable. Accepts `1/0`, `true/false`, `yes/no` (any case). */
export function envBool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}
