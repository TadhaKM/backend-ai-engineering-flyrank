/**
 * Configuration layer.
 *
 * The ONLY place environment variables are read. Every other module receives a
 * typed `AppConfig` by injection instead of touching `process.env` — that keeps
 * modules testable and makes "swap the model/provider by changing config"
 * (assignment goal #6/#9) literally true: nothing is hardcoded downstream.
 *
 * We validate with Zod at startup so a misconfigured deploy fails fast and loud
 * rather than at the first Claude call.
 */
import dotenv from 'dotenv';
import { z } from 'zod';

// `quiet` suppresses dotenv v17's promotional startup "tips" so our logs stay clean.
dotenv.config({ quiet: true });

/** Raw env schema with coercion + defaults. Secrets are optional here so the
 *  server can boot (health checks, docs) even before keys are wired up; the AI
 *  gateway enforces their presence lazily, at call time. */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // --- AI: provider + model are configuration, never hardcoded downstream ---
  AI_PROVIDER: z.string().min(1).default('anthropic'),
  AI_MODEL: z.string().min(1).default('claude-opus-4-8'),
  AI_MAX_TOKENS: z.coerce.number().int().positive().max(128_000).default(4096),
  AI_THINKING: z.enum(['adaptive', 'disabled']).default('disabled'),
  AI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  AI_MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().max(20).default(8),

  // --- Portkey gateway (the seam Claude is reached through) ---
  PORTKEY_API_KEY: z.string().optional(),
  PORTKEY_BASE_URL: z.string().url().default('https://api.portkey.ai/v1'),
  PORTKEY_PROVIDER: z.string().min(1).default('anthropic'),
  PORTKEY_VIRTUAL_KEY: z.string().optional(),

  // --- Provider credential (forwarded through Portkey to Anthropic) ---
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type AiThinkingMode = z.infer<typeof EnvSchema>['AI_THINKING'];
export type AiEffort = NonNullable<z.infer<typeof EnvSchema>['AI_EFFORT']>;

export interface AppConfig {
  server: {
    port: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  ai: {
    provider: string;
    model: string;
    maxTokens: number;
    thinking: AiThinkingMode;
    effort?: AiEffort;
    maxToolIterations: number;
    portkey: {
      apiKey?: string;
      baseUrl: string;
      provider: string;
      virtualKey?: string;
    };
    anthropicApiKey?: string;
  };
}

/**
 * Parse + validate configuration from an env-like object (defaults to
 * `process.env`). Accepting the env as an argument keeps this pure and unit-
 * testable. Throws a `ZodError` with a readable message on invalid input.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const e = parsed.data;
  return {
    server: { port: e.PORT, logLevel: e.LOG_LEVEL },
    ai: {
      provider: e.AI_PROVIDER,
      model: e.AI_MODEL,
      maxTokens: e.AI_MAX_TOKENS,
      thinking: e.AI_THINKING,
      effort: e.AI_EFFORT,
      maxToolIterations: e.AI_MAX_TOOL_ITERATIONS,
      portkey: {
        apiKey: e.PORTKEY_API_KEY,
        baseUrl: e.PORTKEY_BASE_URL,
        provider: e.PORTKEY_PROVIDER,
        virtualKey: e.PORTKEY_VIRTUAL_KEY,
      },
      anthropicApiKey: e.ANTHROPIC_API_KEY,
    },
  };
}

/** A secrets-free view of config, safe to log at startup. */
export function redactConfig(config: AppConfig): Record<string, unknown> {
  const mask = (v?: string) => (v ? `set(${v.length} chars)` : 'unset');
  return {
    server: config.server,
    ai: {
      provider: config.ai.provider,
      model: config.ai.model,
      maxTokens: config.ai.maxTokens,
      thinking: config.ai.thinking,
      effort: config.ai.effort ?? 'default',
      maxToolIterations: config.ai.maxToolIterations,
      portkey: {
        baseUrl: config.ai.portkey.baseUrl,
        provider: config.ai.portkey.provider,
        apiKey: mask(config.ai.portkey.apiKey),
        virtualKey: mask(config.ai.portkey.virtualKey),
      },
      anthropicApiKey: mask(config.ai.anthropicApiKey),
    },
  };
}
