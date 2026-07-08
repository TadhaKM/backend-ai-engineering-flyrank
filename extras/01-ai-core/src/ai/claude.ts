/**
 * ClaudeProvider — the single Anthropic implementation of `LlmProvider`.
 *
 * All Anthropic-specific knowledge (message shape, tool shape, thinking/effort
 * params, stop reasons, error classes) lives here and nowhere else. The chat
 * service depends only on `LlmProvider`, so a second provider (OpenAI, etc.)
 * would be a sibling file — no orchestration changes.
 *
 * The client it receives is Portkey-configured (see gateway.ts), so every call
 * here transparently routes through the gateway.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AppConfig } from '../config/index.ts';
import { UpstreamAiError } from './gateway.ts';
import type {
  LlmContentBlock,
  LlmMessage,
  LlmProvider,
  LlmStopReason,
  LlmTurnRequest,
  LlmTurnResponse,
} from './types.ts';

export interface ClaudeProviderDeps {
  /** Lazily build the Portkey-configured client. Deferred so a missing key
   *  surfaces as a ConfigError on the first request (clean 503), not at boot. */
  getClient: () => Anthropic;
  config: AppConfig;
}

export class ClaudeProvider implements LlmProvider {
  readonly name = 'anthropic/claude';
  private readonly getClient: () => Anthropic;
  private readonly config: AppConfig;
  private client?: Anthropic;

  constructor(deps: ClaudeProviderDeps) {
    this.getClient = deps.getClient;
    this.config = deps.config;
  }

  /** Memoized client. Building it validates config and may throw ConfigError —
   *  called OUTSIDE the try below so it isn't mis-mapped to an upstream error. */
  private resolveClient(): Anthropic {
    this.client ??= this.getClient();
    return this.client;
  }

  async createTurn(request: LlmTurnRequest): Promise<LlmTurnResponse> {
    const client = this.resolveClient();
    let response: Anthropic.Message;
    try {
      response = await client.messages.create(this.buildParams(request));
    } catch (err) {
      throw this.mapError(err);
    }

    return {
      turn: {
        role: 'assistant',
        blocks: this.normalizeContent(response.content),
        raw: response.content, // replayed verbatim next turn (preserves thinking blocks)
      },
      stopReason: this.mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }

  private buildParams(request: LlmTurnRequest): Anthropic.MessageCreateParamsNonStreaming {
    const ai = this.config.ai;

    const tools: Anthropic.Tool[] = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }));

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: ai.model,
      max_tokens: ai.maxTokens,
      system: request.system,
      messages: request.messages.map((m) => this.toAnthropicMessage(m)),
      tools,
      tool_choice: { type: 'auto' },
    };

    // Opus 4.8: adaptive thinking or omit; `budget_tokens` would 400.
    if (ai.thinking === 'adaptive') {
      params.thinking = { type: 'adaptive' };
    }
    if (ai.effort) {
      params.output_config = { effort: ai.effort };
    }
    return params;
  }

  private toAnthropicMessage(message: LlmMessage): Anthropic.MessageParam {
    if (message.role === 'assistant') {
      // Replay the provider's own content array verbatim.
      return { role: 'assistant', content: message.raw as Anthropic.ContentBlockParam[] };
    }
    if (message.content.kind === 'text') {
      return { role: 'user', content: message.content.text };
    }
    const content: Anthropic.ContentBlockParam[] = message.content.results.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.toolUseId,
      content: r.content,
      ...(r.isError ? { is_error: true } : {}),
    }));
    return { role: 'user', content };
  }

  private normalizeContent(content: Anthropic.ContentBlock[]): LlmContentBlock[] {
    const blocks: LlmContentBlock[] = [];
    for (const block of content) {
      if (block.type === 'text') {
        blocks.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
      }
      // Other block types (e.g. thinking) are omitted from the normalized view
      // but preserved in `raw` for replay.
    }
    return blocks;
  }

  private mapStopReason(reason: Anthropic.Message['stop_reason']): LlmStopReason {
    switch (reason) {
      case 'tool_use':
        return 'tool_use';
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'max_tokens';
      default:
        return 'other';
    }
  }

  /** Translate Anthropic/Portkey SDK errors into a single upstream error type. */
  private mapError(err: unknown): UpstreamAiError {
    // APIConnectionError is a subclass of APIError — check it first.
    if (err instanceof Anthropic.APIConnectionError) {
      return new UpstreamAiError('Could not reach the AI gateway (connection error).', {
        status: 503,
        retryable: true,
      });
    }
    if (err instanceof Anthropic.APIError) {
      const upstream = typeof err.status === 'number' ? err.status : undefined;
      const retryable = upstream === 429 || (upstream !== undefined && upstream >= 500);
      const status = upstream === 429 ? 429 : 502; // surface rate limits, else Bad Gateway
      return new UpstreamAiError(`AI gateway request failed: ${err.message}`, {
        status,
        retryable,
        context: { upstreamStatus: upstream },
      });
    }
    return new UpstreamAiError(err instanceof Error ? err.message : 'Unknown AI gateway error', {
      status: 502,
    });
  }
}
