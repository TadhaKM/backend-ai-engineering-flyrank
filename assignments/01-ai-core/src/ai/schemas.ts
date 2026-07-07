/**
 * Zod schemas — the single source of truth for every shape the model produces
 * or consumes.
 *
 * Why one file for both output and tool inputs? Because both need the same two
 * things: (1) a JSON Schema to send to Claude (via `zod-to-json-schema`), and
 * (2) runtime validation of what comes back. Defining each shape once, in Zod,
 * guarantees the schema we advertise and the schema we enforce can never drift.
 */
import { z } from 'zod';

/**
 * The structured answer the service must return — Claude is never allowed to
 * reply with free-form prose. Mirrors the assignment's required shape:
 *   summary / confidence / shouldContinue / sources
 */
export const FinalAnswerSchema = z
  .object({
    summary: z.string().min(1, 'summary must not be empty'),
    confidence: z.number().min(0).max(1),
    shouldContinue: z.boolean(),
    sources: z.array(z.string()).default([]),
  })
  .strict();

export type FinalAnswer = z.infer<typeof FinalAnswerSchema>;

/** The name of the tool Claude must call to deliver its structured answer.
 *  Shared here so prompts and the chat service can't disagree on it. */
export const FINAL_ANSWER_TOOL_NAME = 'final_answer';

// --- Tool input schemas ------------------------------------------------------
// Each tool validates its input against one of these before executing.

export const SearchNotesInput = z
  .object({
    query: z.string().min(1).describe('Free-text to match against note content and tags.'),
    projectId: z.string().optional().describe('Optional project id to scope the search.'),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();
export type SearchNotesInput = z.infer<typeof SearchNotesInput>;

export const GetProjectInput = z
  .object({
    projectId: z.string().min(1).describe('The id of the project to fetch, e.g. "proj_orion".'),
  })
  .strict();
export type GetProjectInput = z.infer<typeof GetProjectInput>;

export const SearchDocumentsInput = z
  .object({
    query: z.string().min(1).describe('Free-text to match against document title and content.'),
    tag: z.string().optional().describe('Optional tag filter, e.g. "architecture".'),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();
export type SearchDocumentsInput = z.infer<typeof SearchDocumentsInput>;

export const RunAnalyticsQueryInput = z
  .object({
    sql: z
      .string()
      .min(1)
      .describe(
        'A single read-only SQL SELECT over tables `projects`, `notes`, `documents`. ' +
          'No INSERT/UPDATE/DELETE/DDL — the query is rejected by a guardrail if it is not read-only.',
      ),
  })
  .strict();
export type RunAnalyticsQueryInput = z.infer<typeof RunAnalyticsQueryInput>;

/** Request body for POST /chat. */
export const ChatRequestSchema = z
  .object({
    message: z.string().min(1, 'message is required').max(4000),
  })
  .strict();
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
