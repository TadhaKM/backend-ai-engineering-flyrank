/**
 * Provider-neutral LLM abstraction — the seam that makes "the LLM is a
 * dependency behind an abstraction layer" real.
 *
 * The chat service depends on `LlmProvider`, never on the Anthropic SDK.
 * Swapping to another provider means writing a new `LlmProvider` implementation;
 * routes and orchestration don't change.
 */

/** A tool advertised to the model. */
export interface LlmToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Normalized content blocks the orchestrator reasons over. */
export type LlmContentBlock =
  { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

/** Result of executing one tool, handed back to the model. */
export interface LlmToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/** A user turn: either plain text (the opening question) or a batch of tool results. */
export type LlmUserContent =
  { kind: 'text'; text: string } | { kind: 'tool_results'; results: LlmToolResult[] };

/**
 * An assistant turn carries BOTH:
 *  - `blocks`: a normalized, provider-agnostic view the orchestrator inspects.
 *  - `raw`: the provider's native content, replayed verbatim on the next
 *    request. This is what lets the neutral loop round-trip provider-specific
 *    payloads (e.g. Claude's opaque thinking blocks) exactly as the API requires.
 */
export interface LlmAssistantTurn {
  role: 'assistant';
  blocks: LlmContentBlock[];
  raw: unknown;
}

export interface LlmUserTurn {
  role: 'user';
  content: LlmUserContent;
}

export type LlmMessage = LlmUserTurn | LlmAssistantTurn;

export type LlmStopReason = 'tool_use' | 'end_turn' | 'max_tokens' | 'other';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmTurnRequest {
  system: string;
  tools: LlmToolSpec[];
  messages: LlmMessage[];
}

export interface LlmTurnResponse {
  turn: LlmAssistantTurn;
  stopReason: LlmStopReason;
  usage: LlmUsage;
  model: string;
}

/** The dependency the chat service is written against. */
export interface LlmProvider {
  readonly name: string;
  createTurn(request: LlmTurnRequest): Promise<LlmTurnResponse>;
}
