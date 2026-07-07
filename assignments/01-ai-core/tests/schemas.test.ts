import { describe, expect, it } from 'vitest';
import { ChatRequestSchema, FinalAnswerSchema } from '../src/ai/schemas.ts';

describe('FinalAnswerSchema', () => {
  it('accepts a well-formed structured answer', () => {
    const parsed = FinalAnswerSchema.parse({
      summary: 'Orion Search uses hybrid retrieval.',
      confidence: 0.82,
      shouldContinue: false,
      sources: ['doc_1', 'note_2'],
    });
    expect(parsed.confidence).toBeCloseTo(0.82);
    expect(parsed.sources).toEqual(['doc_1', 'note_2']);
  });

  it('defaults sources to an empty array', () => {
    const parsed = FinalAnswerSchema.parse({
      summary: 'no sources',
      confidence: 0.1,
      shouldContinue: true,
    });
    expect(parsed.sources).toEqual([]);
  });

  it('rejects confidence outside 0..1', () => {
    expect(() =>
      FinalAnswerSchema.parse({ summary: 'x', confidence: 5, shouldContinue: false }),
    ).toThrow();
    expect(() =>
      FinalAnswerSchema.parse({ summary: 'x', confidence: -1, shouldContinue: false }),
    ).toThrow();
  });

  it('rejects a missing summary', () => {
    expect(() => FinalAnswerSchema.parse({ confidence: 0.5, shouldContinue: false })).toThrow();
  });

  it('rejects unknown fields (strict)', () => {
    expect(() =>
      FinalAnswerSchema.parse({
        summary: 'x',
        confidence: 0.5,
        shouldContinue: false,
        hallucinated: true,
      }),
    ).toThrow();
  });
});

describe('ChatRequestSchema', () => {
  it('accepts a valid body', () => {
    expect(ChatRequestSchema.parse({ message: 'hello' }).message).toBe('hello');
  });

  it('rejects an empty message', () => {
    expect(() => ChatRequestSchema.parse({ message: '' })).toThrow();
  });

  it('rejects a missing message', () => {
    expect(() => ChatRequestSchema.parse({})).toThrow();
  });

  it('rejects unknown fields (strict)', () => {
    expect(() => ChatRequestSchema.parse({ message: 'hi', role: 'admin' })).toThrow();
  });
});
