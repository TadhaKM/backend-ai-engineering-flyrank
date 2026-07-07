/**
 * Central Express error handler. Every thrown/rejected error in a route funnels
 * here (Express 5 forwards async rejections automatically), so failure handling
 * lives in exactly one place and every response has the same shape:
 *
 *   { "error": { "code": "...", "message": "...", "details"?: ... } }
 *
 * It maps our semantic error `code`s to HTTP statuses and never leaks stack
 * traces or internals to the client.
 */
import type { ErrorRequestHandler } from 'express';
import type { Logger } from '@flyrank/shared';
import { AppError } from '@flyrank/shared';
import { ZodError } from 'zod';
import { HttpError } from './httpError.ts';

/** Fallback status for semantic errors that don't carry an explicit `status`. */
const CODE_TO_STATUS: Record<string, number> = {
  CONFIG_ERROR: 503, // provider/gateway not configured → unavailable
  AI_UPSTREAM: 502, // Portkey/Claude failed downstream
  STRUCTURED_OUTPUT_INVALID: 502, // model returned unusable output
  TOOL_LOOP_EXCEEDED: 502,
  SQL_GUARDRAIL_BLOCKED: 400,
  TOOL_INPUT_INVALID: 400,
  UNKNOWN_TOOL: 400,
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      logger.warn('request validation failed', { issues: err.issues });
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.issues,
        },
      });
      return;
    }

    // express.json() throws a SyntaxError (with a `body` property) on malformed JSON.
    if (err instanceof SyntaxError && 'body' in err) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
      return;
    }

    if (err instanceof HttpError) {
      logger.warn('request failed', { code: err.code, status: err.status });
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }

    if (err instanceof AppError) {
      const statusHint =
        'status' in err && typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : CODE_TO_STATUS[err.code];
      const status = statusHint ?? 500;
      logger[status >= 500 ? 'error' : 'warn']('request failed', {
        code: err.code,
        status,
        message: err.message,
        context: err.context,
      });
      res.status(status).json({ error: { code: err.code, message: err.message } });
      return;
    }

    // Unknown/unexpected error — log fully, expose nothing.
    logger.error('unhandled error', {
      message: err instanceof Error ? err.message : String(err),
    });
    res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  };
}
