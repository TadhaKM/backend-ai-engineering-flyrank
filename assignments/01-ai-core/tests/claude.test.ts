import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.ts';
import { ClaudeProvider } from '../src/ai/claude.ts';
import { UpstreamAiError } from '../src/ai/gateway.ts';
import type { LlmTurnRequest } from '../src/ai/types.ts';

type CreateFn = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

function makeProvider(create: CreateFn, env: NodeJS.ProcessEnv = {}): ClaudeProvider {
  const fakeClient = { messages: { create } } as unknown as Anthropic;
  return new ClaudeProvider({ getClient: () => fakeClient, config: loadConfig(env) });
}

function fakeMessage(
  content: unknown[],
  opts: {
    stop_reason?: string;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
  } = {},
): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: opts.model ?? 'claude-opus-4-8',
    content,
    stop_reason: opts.stop_reason ?? 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: opts.usage?.input_tokens ?? 0,
      output_tokens: opts.usage?.output_tokens ?? 0,
    },
  } as unknown as Anthropic.Message;
}

const simpleReq: LlmTurnRequest = {
  system: 's',
  tools: [],
  messages: [{ role: 'user', content: { kind: 'text', text: 'hi' } }],
};

/** Fake Anthropic error whose prototype makes `instanceof` work, without
 *  depending on the SDK error constructor signatures. */
function apiError(status: number): Error {
  const e = Object.create(Anthropic.APIError.prototype) as Error & { status?: number };
  e.message = `status ${status}`;
  e.status = status;
  return e;
}
function connectionError(): Error {
  const e = Object.create(Anthropic.APIConnectionError.prototype) as Error;
  e.message = 'connection refused';
  return e;
}

describe('ClaudeProvider — response normalization', () => {
  it('normalizes text + tool_use, drops thinking from blocks but keeps it in raw', async () => {
    const content = [
      { type: 'text', text: 'hello' },
      { type: 'tool_use', id: 't1', name: 'search_notes', input: { query: 'x' } },
      { type: 'thinking', thinking: 'secret reasoning', signature: 'sig' },
    ];
    const provider = makeProvider(async () =>
      fakeMessage(content, {
        stop_reason: 'tool_use',
        model: 'claude-test',
        usage: { input_tokens: 12, output_tokens: 5 },
      }),
    );

    const res = await provider.createTurn(simpleReq);

    expect(res.turn.blocks).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'tool_use', id: 't1', name: 'search_notes', input: { query: 'x' } },
    ]);
    // raw is the untouched provider content (thinking preserved for replay).
    expect((res.turn.raw as unknown[]).length).toBe(3);
    expect(res.stopReason).toBe('tool_use');
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
    expect(res.model).toBe('claude-test');
  });
});

describe('ClaudeProvider — request mapping', () => {
  it('maps neutral request to Anthropic params (system, tools, messages)', async () => {
    let captured: Anthropic.MessageCreateParamsNonStreaming | undefined;
    const provider = makeProvider(async (params) => {
      captured = params;
      return fakeMessage([{ type: 'text', text: 'ok' }]);
    });

    await provider.createTurn({
      system: 'SYS',
      tools: [
        { name: 'search_notes', description: 'd', inputSchema: { type: 'object', properties: {} } },
      ],
      messages: [
        { role: 'user', content: { kind: 'text', text: 'question' } },
        {
          role: 'assistant',
          blocks: [{ type: 'tool_use', id: 't1', name: 'search_notes', input: { q: 1 } }],
          raw: [{ type: 'tool_use', id: 't1', name: 'search_notes', input: { q: 1 } }],
        },
        {
          role: 'user',
          content: { kind: 'tool_results', results: [{ toolUseId: 't1', content: '{"ok":true}' }] },
        },
      ],
    });

    expect(captured).toBeDefined();
    expect(captured!.model).toBe('claude-opus-4-8');
    expect(captured!.max_tokens).toBe(4096);
    expect(captured!.system).toBe('SYS');
    expect(captured!.tool_choice).toEqual({ type: 'auto' });
    expect(captured!.tools?.[0]).toMatchObject({
      name: 'search_notes',
      input_schema: { type: 'object' },
    });

    const msgs = captured!.messages;
    expect(msgs[0]).toEqual({ role: 'user', content: 'question' });
    expect(msgs[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 't1', name: 'search_notes', input: { q: 1 } }],
    });
    expect(msgs[2]).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}' }],
    });

    // Default config: no extended thinking, no effort.
    expect(captured!.thinking).toBeUndefined();
    expect(captured!.output_config).toBeUndefined();
  });

  it('includes adaptive thinking and effort when configured', async () => {
    let captured: Anthropic.MessageCreateParamsNonStreaming | undefined;
    const provider = makeProvider(
      async (params) => {
        captured = params;
        return fakeMessage([{ type: 'text', text: 'ok' }]);
      },
      { AI_THINKING: 'adaptive', AI_EFFORT: 'high' },
    );

    await provider.createTurn(simpleReq);

    expect(captured!.thinking).toEqual({ type: 'adaptive' });
    expect(captured!.output_config).toEqual({ effort: 'high' });
  });
});

describe('ClaudeProvider — error mapping', () => {
  it('maps a 429 to UpstreamAiError(429, retryable)', async () => {
    const provider = makeProvider(async () => {
      throw apiError(429);
    });
    await expect(provider.createTurn(simpleReq)).rejects.toMatchObject({
      code: 'AI_UPSTREAM',
      status: 429,
      retryable: true,
    });
  });

  it('maps a 500 to UpstreamAiError(502, retryable)', async () => {
    const provider = makeProvider(async () => {
      throw apiError(500);
    });
    const err = await provider.createTurn(simpleReq).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamAiError);
    expect(err).toMatchObject({ status: 502, retryable: true });
  });

  it('maps a connection error to 503', async () => {
    const provider = makeProvider(async () => {
      throw connectionError();
    });
    await expect(provider.createTurn(simpleReq)).rejects.toMatchObject({
      status: 503,
      retryable: true,
    });
  });

  it('maps an unknown error to 502', async () => {
    const provider = makeProvider(async () => {
      throw new Error('weird');
    });
    await expect(provider.createTurn(simpleReq)).rejects.toMatchObject({
      code: 'AI_UPSTREAM',
      status: 502,
    });
  });
});
