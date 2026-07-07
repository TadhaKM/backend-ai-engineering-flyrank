/**
 * Tool factory / registry.
 *
 * WHY A REGISTRY OBJECT INSTEAD OF A `switch`?
 *
 *   function dispatch(name, input) {
 *     switch (name) {
 *       case 'search_notes': return searchNotes(input);
 *       case 'get_project':  return getProject(input);
 *       ...
 *     }
 *   }
 *
 * A switch is fine for 2-3 tools, but it couples three things that want to live
 * together — the tool's name, its schema, and its handler — across two places
 * (the switch AND wherever the schema list is built), so they drift. Every new
 * tool means editing multiple sites, and you can't enumerate the tool set
 * (needed to advertise `tools` to Claude) without hand-maintaining a parallel
 * list.
 *
 * The registry keeps name + description + schema + handler in ONE object and
 * lets us:
 *   - derive the JSON Schema list for the model from the same definitions,
 *   - validate input against the same schema we advertised,
 *   - add a tool by registering it once, with no switch to update.
 *
 * The tradeoff: a switch is marginally more transparent and has zero indirection
 * (nice for a tiny, fixed tool set). The registry pays a little indirection for
 * consistency and scale — the right call once tools are dynamic or numerous.
 */
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AppError } from '@flyrank/shared';
import type { ToolContext } from './toolContext.ts';

/**
 * A single tool: its contract (name/description/schema) plus its behaviour.
 *
 * Generic over the Zod *schema* type (not the value type) so the handler's
 * `input` is inferred as the schema's OUTPUT — correctly accounting for
 * `.default()`/`.optional()`, where a field's input and output types differ.
 */
export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  /** Zod schema — the single source of truth for both the advertised JSON
   *  Schema and runtime input validation. */
  schema: S;
  handler: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown> | unknown;
}

/** The advertised shape sent to the model's `tools` array. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Outcome of executing a tool. Expected failures are values, not exceptions,
 *  so the agent loop can hand them back to the model as `tool_result` errors and
 *  let it recover — rather than aborting the whole request. */
export type ToolDispatchResult =
  { ok: true; data: unknown } | { ok: false; code: string; message: string };

/** Convert a Zod schema to a clean JSON Schema for the model's `tools` array. */
export function toToolJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema) as Record<string, unknown>;
  delete json.$schema; // Anthropic wants the bare schema object
  return json;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register<S extends z.ZodTypeAny>(def: ToolDefinition<S>): this {
    if (this.tools.has(def.name)) {
      throw new Error(`Duplicate tool registration: ${def.name}`);
    }
    this.tools.set(def.name, def as unknown as ToolDefinition);
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** JSON-schema specs to advertise to the model. */
  specs(): ToolSpec[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toToolJsonSchema(t.schema),
    }));
  }

  /**
   * Validate input, then execute. Returns a discriminated result; only truly
   * unexpected (non-`AppError`) throws are wrapped as a generic execution error.
   */
  async dispatch(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolDispatchResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` };
    }

    // "Validate every tool input" — never pass unvalidated model output to a handler.
    const parsed = tool.schema.safeParse(rawInput);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      return {
        ok: false,
        code: 'TOOL_INPUT_INVALID',
        message: `Invalid input for "${name}": ${detail}`,
      };
    }

    try {
      const data = await tool.handler(parsed.data, ctx);
      return { ok: true, data };
    } catch (err) {
      // Guardrail / execution errors are AppErrors with a stable code.
      if (err instanceof AppError) {
        return { ok: false, code: err.code, message: err.message };
      }
      return {
        ok: false,
        code: 'TOOL_EXECUTION_ERROR',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
