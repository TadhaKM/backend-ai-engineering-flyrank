/**
 * HTTP-aware error type for the route layer.
 *
 * Domain modules throw semantic `AppError`s (with a `code`); the route layer and
 * the central error handler translate those into `HttpError`s / status codes.
 * Keeping HTTP concerns out of the domain keeps the AI code transport-agnostic.
 */
import { AppError } from '@flyrank/shared';

export class HttpError extends AppError {
  readonly status: number;
  constructor(status: number, code: string, message: string, context?: Record<string, unknown>) {
    super(code, message, context);
    this.status = status;
  }
}

export const badRequest = (message: string, context?: Record<string, unknown>) =>
  new HttpError(400, 'BAD_REQUEST', message, context);

export const unprocessableEntity = (message: string, context?: Record<string, unknown>) =>
  new HttpError(422, 'UNPROCESSABLE_ENTITY', message, context);

export const badGateway = (message: string, context?: Record<string, unknown>) =>
  new HttpError(502, 'BAD_GATEWAY', message, context);

export const serviceUnavailable = (message: string, context?: Record<string, unknown>) =>
  new HttpError(503, 'SERVICE_UNAVAILABLE', message, context);
