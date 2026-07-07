import { describe, expect, it } from 'vitest';
import type { Logger } from '@flyrank/shared';
import { loadConfig } from '../src/config/index.ts';
import { buildToolRegistry } from '../src/ai/tools.ts';
import { createToolContext, loadSampleData, type ToolContext } from '../src/ai/toolContext.ts';

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};

function makeContext(): ToolContext {
  return createToolContext({
    data: loadSampleData(),
    logger: silentLogger,
    user: { id: 'u1', name: 'tester', roles: ['engineer'] },
    config: loadConfig({}),
  });
}

describe('tool dispatch — happy paths', () => {
  it('search_notes finds notes by text', async () => {
    const registry = buildToolRegistry();
    const result = await registry.dispatch('search_notes', { query: 'latency' }, makeContext());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { count: number };
      expect(data.count).toBeGreaterThan(0);
    }
  });

  it('get_project returns a project with counts', async () => {
    const registry = buildToolRegistry();
    const result = await registry.dispatch(
      'get_project',
      { projectId: 'proj_orion' },
      makeContext(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { found: boolean; noteCount: number };
      expect(data.found).toBe(true);
      expect(data.noteCount).toBeGreaterThan(0);
    }
  });

  it('get_project reports not-found for a bad id', async () => {
    const registry = buildToolRegistry();
    const result = await registry.dispatch('get_project', { projectId: 'nope' }, makeContext());
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.data as { found: boolean }).found).toBe(false);
  });

  it('run_analytics_query executes a safe read-only aggregate', async () => {
    const registry = buildToolRegistry();
    const result = await registry.dispatch(
      'run_analytics_query',
      { sql: 'SELECT projectId, COUNT(*) AS c FROM notes GROUP BY projectId' },
      makeContext(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { rowCount: number; rows: unknown[] };
      expect(data.rowCount).toBeGreaterThan(0);
      expect(Array.isArray(data.rows)).toBe(true);
    }
  });
});

describe('tool dispatch — error paths (Step 7)', () => {
  it('returns UNKNOWN_TOOL for an unregistered tool', async () => {
    const result = await buildToolRegistry().dispatch('does_not_exist', {}, makeContext());
    expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_TOOL' });
  });

  it('returns TOOL_INPUT_INVALID for bad arguments', async () => {
    // search_notes requires `query`
    const result = await buildToolRegistry().dispatch('search_notes', { limit: 3 }, makeContext());
    expect(result).toMatchObject({ ok: false, code: 'TOOL_INPUT_INVALID' });
  });

  it('returns SQL_GUARDRAIL_BLOCKED when the model writes dangerous SQL', async () => {
    const result = await buildToolRegistry().dispatch(
      'run_analytics_query',
      { sql: 'DROP TABLE notes' },
      makeContext(),
    );
    expect(result).toMatchObject({ ok: false, code: 'SQL_GUARDRAIL_BLOCKED' });
  });
});
