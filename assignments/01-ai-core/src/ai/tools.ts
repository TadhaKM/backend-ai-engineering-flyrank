/**
 * Concrete tools operating over the local dataset (`sampleData.json`).
 *
 * Each tool is a `ToolDefinition`: a name + description (which Claude reads to
 * decide when to call it), a Zod input schema, and a handler that receives the
 * validated input and the shared `ToolContext`.
 *
 * `run_analytics_query` is the model-generated-SQL surface: Claude writes a
 * read-only SELECT, we run it through the lexical guardrail (`assertSafeSql`),
 * then execute it read-only against in-memory tables via alasql.
 */
import alasql from 'alasql';
import { AppError } from '@flyrank/shared';
import {
  GetProjectInput,
  RunAnalyticsQueryInput,
  SearchDocumentsInput,
  SearchNotesInput,
} from './schemas.ts';
import { assertSafeSql } from './guardrails.ts';
import { ToolRegistry, type ToolDefinition } from './toolFactory.ts';
import type { SampleData } from './toolContext.ts';

const MAX_QUERY_ROWS = 100;

/** Expose the dataset arrays to alasql as named, read-only tables. Re-assigned
 *  per query so execution is deterministic and never mutated. */
function registerTables(data: SampleData): void {
  const tables = alasql.tables as Record<string, { data: unknown[] }>;
  tables.projects = { data: data.projects };
  tables.notes = { data: data.notes };
  tables.documents = { data: data.documents };
}

export const searchNotesTool: ToolDefinition<typeof SearchNotesInput> = {
  name: 'search_notes',
  description:
    'Search engineering notes by free text (matches note body and tags). Optionally scope to a projectId. ' +
    'Call this when the user asks what was noted, decided, or observed about a project or topic.',
  schema: SearchNotesInput,
  handler: (input, ctx) => {
    const q = input.query.toLowerCase();
    const matches = ctx.data.notes
      .filter((n) => !input.projectId || n.projectId === input.projectId)
      .filter(
        (n) => n.text.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .slice(0, input.limit);
    ctx.logger.debug('tool.search_notes', {
      query: input.query,
      projectId: input.projectId,
      matched: matches.length,
    });
    return { count: matches.length, notes: matches };
  },
};

export const getProjectTool: ToolDefinition<typeof GetProjectInput> = {
  name: 'get_project',
  description:
    'Fetch a single project by id (e.g. "proj_orion") along with how many notes and documents reference it. ' +
    'Call this when the user asks about a specific, named project.',
  schema: GetProjectInput,
  handler: (input, ctx) => {
    const project = ctx.data.projects.find((p) => p.id === input.projectId);
    if (!project) {
      return { found: false, projectId: input.projectId };
    }
    const noteCount = ctx.data.notes.filter((n) => n.projectId === project.id).length;
    const documentCount = ctx.data.documents.filter((d) => d.projectId === project.id).length;
    return { found: true, project, noteCount, documentCount };
  },
};

export const searchDocumentsTool: ToolDefinition<typeof SearchDocumentsInput> = {
  name: 'search_documents',
  description:
    'Search documents by free text (matches title and content). Optionally filter by tag (e.g. "architecture", "eval"). ' +
    'Call this when the user asks about design docs, playbooks, or written documentation.',
  schema: SearchDocumentsInput,
  handler: (input, ctx) => {
    const q = input.query.toLowerCase();
    const matches = ctx.data.documents
      .filter((d) => !input.tag || d.tag === input.tag)
      .filter((d) => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
      .slice(0, input.limit);
    ctx.logger.debug('tool.search_documents', {
      query: input.query,
      tag: input.tag,
      matched: matches.length,
    });
    return { count: matches.length, documents: matches };
  },
};

export const runAnalyticsQueryTool: ToolDefinition<typeof RunAnalyticsQueryInput> = {
  name: 'run_analytics_query',
  description:
    'Run ONE read-only SQL SELECT for counts, aggregations, or joins over tables ' +
    'projects(id,name,status,owner,createdAt), notes(id,projectId,author,createdAt), ' +
    'documents(id,projectId,title,tag,updatedAt). Read-only ONLY: any INSERT/UPDATE/DELETE/DDL/UNION ' +
    'is rejected by a security guardrail. Use this for questions like "how many notes per project".',
  schema: RunAnalyticsQueryInput,
  handler: (input, ctx) => {
    // Guardrail first — throws SqlGuardrailError, which dispatch turns into a
    // tool_result error the model can see and correct.
    const safeSql = assertSafeSql(input.sql);
    registerTables(ctx.data);

    let rows: unknown;
    try {
      rows = alasql(safeSql);
    } catch (err) {
      throw new AppError(
        'SQL_EXECUTION_ERROR',
        `Query failed to execute: ${err instanceof Error ? err.message : String(err)}`,
        { sql: safeSql },
      );
    }

    const rowArray = Array.isArray(rows) ? rows : [];
    ctx.logger.debug('tool.run_analytics_query', { sql: safeSql, rows: rowArray.length });
    return { query: safeSql, rowCount: rowArray.length, rows: rowArray.slice(0, MAX_QUERY_ROWS) };
  },
};

/** Assemble the registry of executable tools. `final_answer` is intentionally
 *  NOT here — it's the output contract, handled by the chat service, not an
 *  executable data tool. */
export function buildToolRegistry(): ToolRegistry {
  return new ToolRegistry()
    .register(searchNotesTool)
    .register(getProjectTool)
    .register(searchDocumentsTool)
    .register(runAnalyticsQueryTool);
}
