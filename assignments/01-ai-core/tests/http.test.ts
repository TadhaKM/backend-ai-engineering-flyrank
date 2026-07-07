import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ConfigError, type Logger } from '@flyrank/shared';
import { loadConfig } from '../src/config/index.ts';
import { createApp } from '../src/server.ts';
import { ChatService } from '../src/ai/chatService.ts';
import { buildToolRegistry } from '../src/ai/tools.ts';
import { loadSampleData, type CurrentUser } from '../src/ai/toolContext.ts';
import type { LlmProvider, LlmTurnRequest, LlmTurnResponse } from '../src/ai/types.ts';

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};

const user: CurrentUser = { id: 'u', name: 'tester', roles: ['engineer'] };

/** A provider whose behaviour is supplied per test. */
class FnProvider implements LlmProvider {
  readonly name = 'fn';
  constructor(private readonly fn: (req: LlmTurnRequest) => LlmTurnResponse) {}
  async createTurn(req: LlmTurnRequest): Promise<LlmTurnResponse> {
    return this.fn(req);
  }
}

function finalAnswerTurn(answer: unknown): LlmTurnResponse {
  const blocks = [{ type: 'tool_use' as const, id: 'f1', name: 'final_answer', input: answer }];
  return {
    turn: { role: 'assistant', blocks, raw: blocks },
    stopReason: 'tool_use',
    usage: { inputTokens: 1, outputTokens: 1 },
    model: 'fake',
  };
}

function makeApp(provider: LlmProvider) {
  const chatService = new ChatService({
    provider,
    registry: buildToolRegistry(),
    data: loadSampleData(),
    config: loadConfig({}),
    logger: silentLogger,
  });
  return createApp({ chatService, currentUser: user, logger: silentLogger });
}

describe('HTTP /health', () => {
  it('returns ok', async () => {
    const provider = new FnProvider(() => finalAnswerTurn({}));
    const res = await request(makeApp(provider)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});

describe('HTTP POST /chat', () => {
  it('200 — returns the validated structured answer', async () => {
    const provider = new FnProvider(() =>
      finalAnswerTurn({
        summary: 'Orion has 2 notes.',
        confidence: 0.8,
        shouldContinue: false,
        sources: ['proj_orion'],
      }),
    );
    const res = await request(makeApp(provider))
      .post('/chat')
      .send({ message: 'How many notes in Orion?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toMatchObject({ summary: 'Orion has 2 notes.', confidence: 0.8 });
    expect(res.body.meta).toHaveProperty('model');
  });

  it('400 VALIDATION_ERROR — missing message', async () => {
    const provider = new FnProvider(() => finalAnswerTurn({}));
    const res = await request(makeApp(provider)).post('/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 INVALID_JSON — malformed body', async () => {
    const provider = new FnProvider(() => finalAnswerTurn({}));
    const res = await request(makeApp(provider))
      .post('/chat')
      .set('Content-Type', 'application/json')
      .send('{ not json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('502 STRUCTURED_OUTPUT_INVALID — model returns a bad answer', async () => {
    const provider = new FnProvider(() =>
      finalAnswerTurn({ summary: 'x', confidence: 5, shouldContinue: false }),
    );
    const res = await request(makeApp(provider)).post('/chat').send({ message: 'hi' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('STRUCTURED_OUTPUT_INVALID');
  });

  it('503 CONFIG_ERROR — gateway not configured', async () => {
    const provider = new FnProvider(() => {
      throw new ConfigError('PORTKEY_API_KEY is not set.');
    });
    const res = await request(makeApp(provider)).post('/chat').send({ message: 'hi' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('CONFIG_ERROR');
  });
});

describe('HTTP unknown route', () => {
  it('404 NOT_FOUND', async () => {
    const provider = new FnProvider(() => finalAnswerTurn({}));
    const res = await request(makeApp(provider)).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
