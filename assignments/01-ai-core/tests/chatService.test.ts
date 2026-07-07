import { describe, expect, it } from 'vitest';
import type { Logger } from '@flyrank/shared';
import { loadConfig } from '../src/config/index.ts';
import { ChatService } from '../src/ai/chatService.ts';
import { buildToolRegistry } from '../src/ai/tools.ts';
import { loadSampleData, type CurrentUser } from '../src/ai/toolContext.ts';
import type {
  LlmContentBlock,
  LlmProvider,
  LlmTurnRequest,
  LlmTurnResponse,
} from '../src/ai/types.ts';

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};

const user: CurrentUser = { id: 'u1', name: 'tester', roles: ['engineer'] };

/** A fake provider that replays scripted turns — this is the whole point of the
 *  `LlmProvider` seam: the orchestration loop is testable with zero network. */
class ScriptedProvider implements LlmProvider {
  readonly name = 'fake';
  private index = 0;
  constructor(private readonly turns: LlmTurnResponse[]) {}
  async createTurn(_request: LlmTurnRequest): Promise<LlmTurnResponse> {
    const turn = this.turns[this.index++];
    if (!turn) throw new Error('ScriptedProvider ran out of scripted turns');
    return turn;
  }
}

function toolUseTurn(id: string, name: string, input: unknown): LlmTurnResponse {
  const blocks: LlmContentBlock[] = [{ type: 'tool_use', id, name, input }];
  return {
    turn: { role: 'assistant', blocks, raw: blocks },
    stopReason: 'tool_use',
    usage: { inputTokens: 10, outputTokens: 5 },
    model: 'fake-model',
  };
}

function textTurn(text: string): LlmTurnResponse {
  const blocks: LlmContentBlock[] = [{ type: 'text', text }];
  return {
    turn: { role: 'assistant', blocks, raw: blocks },
    stopReason: 'end_turn',
    usage: { inputTokens: 1, outputTokens: 1 },
    model: 'fake-model',
  };
}

function makeService(provider: LlmProvider, env: NodeJS.ProcessEnv = {}): ChatService {
  return new ChatService({
    provider,
    registry: buildToolRegistry(),
    data: loadSampleData(),
    config: loadConfig(env),
    logger: silentLogger,
  });
}

describe('ChatService orchestration', () => {
  it('runs a data tool then returns the validated final_answer', async () => {
    const provider = new ScriptedProvider([
      toolUseTurn('t1', 'search_notes', { query: 'latency' }),
      toolUseTurn('t2', 'final_answer', {
        summary: 'Reranking roughly doubled p95 latency.',
        confidence: 0.9,
        shouldContinue: false,
        sources: ['note_1'],
      }),
    ]);
    const result = await makeService(provider).chat('Tell me about latency.', user);

    expect(result.answer.summary).toContain('latency');
    expect(result.answer.confidence).toBeCloseTo(0.9);
    expect(result.meta.toolCalls).toBe(1);
    expect(result.meta.iterations).toBe(2);
  });

  it('rejects with STRUCTURED_OUTPUT_INVALID when final_answer fails validation', async () => {
    const provider = new ScriptedProvider([
      toolUseTurn('t1', 'final_answer', { summary: 'x', confidence: 5, shouldContinue: false }),
    ]);
    await expect(makeService(provider).chat('hi', user)).rejects.toMatchObject({
      code: 'STRUCTURED_OUTPUT_INVALID',
    });
  });

  it('accepts a valid JSON answer returned as plain text (fallback path)', async () => {
    const provider = new ScriptedProvider([
      textTurn(
        JSON.stringify({ summary: 'ok', confidence: 0.4, shouldContinue: true, sources: [] }),
      ),
    ]);
    const result = await makeService(provider).chat('hi', user);
    expect(result.answer.summary).toBe('ok');
    expect(result.answer.shouldContinue).toBe(true);
  });

  it('rejects free-form non-JSON text with STRUCTURED_OUTPUT_INVALID', async () => {
    const provider = new ScriptedProvider([textTurn('I think the answer is 42.')]);
    await expect(makeService(provider).chat('hi', user)).rejects.toMatchObject({
      code: 'STRUCTURED_OUTPUT_INVALID',
    });
  });

  it('enforces the tool-iteration guard', async () => {
    // Model keeps calling a data tool and never finalises.
    const provider = new ScriptedProvider([
      toolUseTurn('t1', 'search_notes', { query: 'x' }),
      toolUseTurn('t2', 'search_notes', { query: 'x' }),
    ]);
    await expect(
      makeService(provider, { AI_MAX_TOOL_ITERATIONS: '2' }).chat('hi', user),
    ).rejects.toMatchObject({
      code: 'TOOL_LOOP_EXCEEDED',
    });
  });
});
