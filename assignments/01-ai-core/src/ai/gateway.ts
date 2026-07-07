/**
 * The Portkey gateway seam (assignment Step 1).
 *
 *   route  ->  chat service  ->  LlmProvider (Claude)  ->  THIS gateway  ->  Portkey  ->  Anthropic
 *
 * We build an Anthropic SDK client whose `baseURL` is the Portkey AI Gateway and
 * whose default headers carry Portkey's routing config. Every Claude request
 * therefore flows through Portkey (observability, retries, fallbacks, key
 * management) — no code path talks to api.anthropic.com directly. Because the
 * provider is a header/config value, re-pointing Portkey at a different upstream
 * is a configuration change, not a code change.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createHeaders, PORTKEY_GATEWAY_URL } from 'portkey-ai';
import { AppError, ConfigError } from '@flyrank/shared';
import type { AppConfig } from '../config/index.ts';

/** A failure originating downstream of us (Portkey or the provider). Carries an
 *  HTTP status hint and a retryable flag so the error handler can respond well. */
export class UpstreamAiError extends AppError {
  readonly status: number;
  readonly retryable: boolean;
  constructor(
    message: string,
    opts: { status?: number; retryable?: boolean; context?: Record<string, unknown> } = {},
  ) {
    super('AI_UPSTREAM', message, opts.context);
    this.status = opts.status ?? 502;
    this.retryable = opts.retryable ?? false;
  }
}

/**
 * Construct the transport client. Credentials are validated here (lazily, at
 * client-build time) rather than at server startup, so the process can boot and
 * serve health checks even before keys are configured — the first `/chat` call
 * is where a missing key surfaces, as a clean 503.
 */
export function createGatewayClient(config: AppConfig): Anthropic {
  const { portkey, anthropicApiKey } = config.ai;

  if (!portkey.apiKey) {
    throw new ConfigError('PORTKEY_API_KEY is not set — cannot reach the AI gateway.');
  }
  const hasVirtualKey = Boolean(portkey.virtualKey);
  if (!hasVirtualKey && !anthropicApiKey) {
    throw new ConfigError('No provider credential: set PORTKEY_VIRTUAL_KEY or ANTHROPIC_API_KEY.');
  }

  const headers = createHeaders({
    apiKey: portkey.apiKey,
    provider: portkey.provider,
    ...(portkey.virtualKey ? { virtualKey: portkey.virtualKey } : {}),
  });

  return new Anthropic({
    // With a Portkey virtual key, the provider credential lives in Portkey; the
    // Anthropic SDK still needs a non-empty apiKey to construct. Auth is carried
    // by the Portkey headers regardless.
    apiKey: anthropicApiKey ?? 'via-portkey-virtual-key',
    baseURL: portkey.baseUrl || PORTKEY_GATEWAY_URL,
    defaultHeaders: headers,
  });
}
