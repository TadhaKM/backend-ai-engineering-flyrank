import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../src/errors.ts';
import { envBool, envNumber, requireEnv, getEnv } from '../src/env.ts';
import { err, isErr, isOk, ok, tryCatch } from '../src/result.ts';

const KEY = '__FLYRANK_TEST_ENV__';

afterEach(() => {
  delete process.env[KEY];
});

describe('env helpers', () => {
  it('requireEnv returns the value when set', () => {
    process.env[KEY] = 'hello';
    expect(requireEnv(KEY)).toBe('hello');
  });

  it('requireEnv throws ConfigError when missing', () => {
    expect(() => requireEnv(KEY)).toThrow(ConfigError);
  });

  it('getEnv falls back when unset', () => {
    expect(getEnv(KEY, 'fallback')).toBe('fallback');
  });

  it('envNumber parses numbers and rejects garbage', () => {
    process.env[KEY] = '42';
    expect(envNumber(KEY)).toBe(42);
    process.env[KEY] = 'not-a-number';
    expect(() => envNumber(KEY)).toThrow(ConfigError);
  });

  it('envBool understands common truthy strings', () => {
    process.env[KEY] = 'yes';
    expect(envBool(KEY)).toBe(true);
    process.env[KEY] = 'off';
    expect(envBool(KEY)).toBe(false);
    expect(envBool(KEY + '_UNSET', true)).toBe(true);
  });
});

describe('result helpers', () => {
  it('ok / err construct discriminated results', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err('boom'))).toBe(true);
  });

  it('tryCatch captures thrown errors', () => {
    const result = tryCatch(() => {
      throw new Error('nope');
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.message).toBe('nope');
  });
});
