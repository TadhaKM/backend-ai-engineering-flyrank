/**
 * ChatService — the AI service the route depends on.
 *
 *   route -> ChatService.chat() -> LlmProvider (Claude via Portkey) -> tools
 *
 * It owns the agentic tool-use loop and the structured-output contract:
 *
 *   1. Send the conversation to the provider.
 *   2. If the model called `final_answer`, validate its input with Zod and
 *      return it — the ONLY success path (structured output, never free prose).
 *   3. If it called data tools, execute them (validated + guardrailed by the
 *      registry), feed results back, and loop.
 *   4. If it returned plain text, try to parse+validate it as JSON as a fallback
 *      so a malformed answer is caught and surfaced, not crashed on.
 *   5. Bound the loop with a max-iteration guard.
 */
import { AppError } from '@flyrank/shared';
import type { Logger } from '@flyrank/shared';
import type { AppConfig } from '../config/index.ts';
import { FINAL_ANSWER_TOOL_NAME, FinalAnswerSchema, type FinalAnswer } from './schemas.ts';
import { buildSystemPrompt } from './prompts.ts';
import { toToolJsonSchema, type ToolRegistry } from './toolFactory.ts';
import { createToolContext, type CurrentUser, type SampleData } from './toolContext.ts';
import type {
  LlmContentBlock,
  LlmMessage,
  LlmProvider,
  LlmToolResult,
  LlmToolSpec,
} from './types.ts';

/** The model produced output that isn't a valid structured answer. */
export class StructuredOutputError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('STRUCTURED_OUTPUT_INVALID', message, context);
  }
}

/** The tool loop ran too long without a final answer (runaway guard). */
export class ToolLoopExceededError extends AppError {
  constructor(max: number) {
    super('TOOL_LOOP_EXCEEDED', `Reached the ${max}-iteration limit without a final answer.`, {
      max,
    });
  }
}

export interface ChatResult {
  answer: FinalAnswer;
  meta: {
    model: string;
    iterations: number;
    toolCalls: number;
    usage: { inputTokens: number; outputTokens: number };
  };
}

export interface ChatServiceDeps {
  provider: LlmProvider;
  registry: ToolRegistry;
  data: SampleData;
  config: AppConfig;
  logger: Logger;
}

type TextBlock = Extract<LlmContentBlock, { type: 'text' }>;
type ToolUseBlock = Extract<LlmContentBlock, { type: 'tool_use' }>;

export class ChatService {
  private readonly provider: LlmProvider;
  private readonly registry: ToolRegistry;
  private readonly data: SampleData;
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly toolSpecs: LlmToolSpec[];

  constructor(deps: ChatServiceDeps) {
    this.provider = deps.provider;
    this.registry = deps.registry;
    this.data = deps.data;
    this.config = deps.config;
    this.logger = deps.logger;

    // Advertise the data tools plus the structured-output tool.
    this.toolSpecs = [
      ...deps.registry.specs(),
      {
        name: FINAL_ANSWER_TOOL_NAME,
        description:
          'Deliver the final structured answer to the user. Call this exactly once, when you have ' +
          'gathered enough information. Do not answer with free-form text.',
        inputSchema: toToolJsonSchema(FinalAnswerSchema),
      },
    ];
  }

  async chat(message: string, user: CurrentUser): Promise<ChatResult> {
    const ctx = createToolContext({
      data: this.data,
      logger: this.logger,
      user,
      config: this.config,
    });
    const system = buildSystemPrompt(user);
    const messages: LlmMessage[] = [{ role: 'user', content: { kind: 'text', text: message } }];
    const maxIterations = this.config.ai.maxToolIterations;

    let toolCalls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let model = this.config.ai.model;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const response = await this.provider.createTurn({ system, tools: this.toolSpecs, messages });
      inputTokens += response.usage.inputTokens;
      outputTokens += response.usage.outputTokens;
      model = response.model;
      messages.push(response.turn);

      const toolUses = response.turn.blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');
      const finalCall = toolUses.find((b) => b.name === FINAL_ANSWER_TOOL_NAME);

      // (2) Structured answer via the final_answer tool — the happy path.
      if (finalCall) {
        return {
          answer: this.validateFinalAnswer(finalCall.input),
          meta: { model, iterations: iteration, toolCalls, usage: { inputTokens, outputTokens } },
        };
      }

      // (3) Data tool calls — execute all, return all results in one user turn.
      if (toolUses.length > 0) {
        const results: LlmToolResult[] = [];
        for (const call of toolUses) {
          toolCalls += 1;
          const result = await this.registry.dispatch(call.name, call.input, ctx);
          if (result.ok) {
            results.push({ toolUseId: call.id, content: JSON.stringify(result.data) });
          } else {
            this.logger.warn('tool.call_failed', { tool: call.name, code: result.code });
            results.push({
              toolUseId: call.id,
              content: JSON.stringify({ error: { code: result.code, message: result.message } }),
              isError: true,
            });
          }
        }
        messages.push({ role: 'user', content: { kind: 'tool_results', results } });
        continue;
      }

      // (4) Plain text with no tool call — try to parse it as the structured
      // answer so a malformed reply is caught, not crashed on.
      const text = response.turn.blocks
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return {
        answer: this.parseTextAsFinalAnswer(text),
        meta: { model, iterations: iteration, toolCalls, usage: { inputTokens, outputTokens } },
      };
    }

    // (5) Runaway guard.
    throw new ToolLoopExceededError(maxIterations);
  }

  /** Validate the `final_answer` tool input against the Zod schema. */
  private validateFinalAnswer(input: unknown): FinalAnswer {
    const parsed = FinalAnswerSchema.safeParse(input);
    if (!parsed.success) {
      throw new StructuredOutputError('final_answer did not match the required schema.', {
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }

  /** Fallback: parse free-form text as JSON and validate it. */
  private parseTextAsFinalAnswer(text: string): FinalAnswer {
    if (!text) {
      throw new StructuredOutputError('Model returned neither a tool call nor any text.');
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new StructuredOutputError(
        'Model returned free-form text instead of a structured answer.',
        {
          sample: text.slice(0, 200),
        },
      );
    }
    const parsed = FinalAnswerSchema.safeParse(json);
    if (!parsed.success) {
      throw new StructuredOutputError('Model output did not match the required schema.', {
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}
