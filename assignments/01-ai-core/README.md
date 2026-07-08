# Assignment 01 — AI Core

> **Status:** 🟢 Complete — 69 automated tests pass, and the service is **verified live** against `claude-opus-4-8` through the Portkey gateway (multi-turn tool use, model-generated SQL, and a guardrail rejection all confirmed end-to-end).

A production-style backend AI service where **the LLM is a dependency behind an abstraction layer**, not a hardcoded call. It routes every request through the **Portkey AI Gateway** to **Anthropic Claude**, returns **Zod-validated structured output**, supports **Claude tool use over local data**, and puts **security guardrails** on any model-generated SQL.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Why the gateway exists](#why-the-gateway-exists)
- [Request flow](#request-flow)
- [Setup](#setup)
- [Running it](#running-it)
- [The API](#the-api)
- [How each piece works](#how-each-piece-works)
  - [Structured output](#structured-output-step-2)
  - [Tool use](#tool-use-step-3)
  - [ToolContext](#toolcontext-step-4)
  - [Tool factory](#tool-factory-step-5)
  - [SQL guardrails](#sql-guardrails-step-6)
  - [Error handling](#error-handling-step-7)
- [Configuration](#configuration-step-9)
- [Testing](#testing)
- [Project structure](#project-structure)

---

## What it does

`POST /chat` takes a natural-language question about an engineering workspace
(projects, notes, documents). Claude decides which tools to call to gather
evidence, then returns a **validated JSON answer**:

```json
{
  "summary": "Orion Search has 2 notes and 2 documents...",
  "confidence": 0.86,
  "shouldContinue": false,
  "sources": ["proj_orion", "note_1", "doc_1"]
}
```

The model is never allowed to reply with free-form prose — the answer is always
that shape, and it's validated with Zod before it leaves the service.

---

## Architecture

Every layer depends only on the layer's **interface**, never on a concrete
provider. The dependency direction is one-way:

```text
 HTTP            routes/chat.ts        thin: validate body, call the service
   │
   ▼
 Service         ai/chatService.ts     owns the tool-use loop + output contract
   │  depends on LlmProvider (interface)
   ▼
 Provider        ai/claude.ts          ClaudeProvider: maps neutral <-> Anthropic
   │  builds requests via
   ▼
 Gateway         ai/gateway.ts         Anthropic SDK pointed at Portkey
   │
   ▼
 Portkey  ──▶  Anthropic Claude
```

Supporting modules: [`ai/tools.ts`](src/ai/tools.ts) +
[`ai/toolFactory.ts`](src/ai/toolFactory.ts) (the tool registry),
[`ai/guardrails.ts`](src/ai/guardrails.ts) (SQL safety),
[`ai/schemas.ts`](src/ai/schemas.ts) (Zod contracts),
[`config/`](src/config/index.ts) (typed configuration),
[`utils/`](src/utils/) (HTTP errors + central error handler).

**The key seam** is [`LlmProvider`](src/ai/types.ts): the chat service is written
against that interface. Claude is one implementation. Swapping providers means
writing a new implementation — routes and orchestration don't change.

---

## Why the gateway exists

> Routes never call Claude directly. Route → service → provider → **Portkey** → Claude.

Putting Portkey in the middle buys, without touching application code:

- **Observability** — every request/response is logged and traced centrally.
- **Reliability** — retries, timeouts, and fallbacks are gateway config.
- **Cost & key management** — provider keys live in Portkey (as _virtual keys_),
  not scattered across services.
- **Swappability** — the upstream provider/model is a header + config value, so
  re-pointing traffic is a configuration change.

Concretely, [`gateway.ts`](src/ai/gateway.ts) builds an Anthropic SDK client whose
`baseURL` is the Portkey gateway and whose default headers carry Portkey's
routing config (via `createHeaders` from `portkey-ai`). The Anthropic SDK is used
for its correct, typed request/response shapes; Portkey is what those requests
actually flow through.

---

## Request flow

1. `POST /chat` validates the body with Zod ([`schemas.ts`](src/ai/schemas.ts)).
2. [`ChatService`](src/ai/chatService.ts) sends the conversation to the provider
   with the tool list (data tools + the `final_answer` tool).
3. Claude either **calls a data tool** (we execute it, validate its input, feed
   the result back, loop) or **calls `final_answer`** (we Zod-validate and return).
4. All Claude traffic goes through Portkey → Anthropic.
5. Failures at any layer become a clean HTTP response (never a crash).

---

## Setup

Requires **Node.js ≥ 20**. From the **repo root** (workspaces install everything):

```bash
npm install
```

Then configure this assignment:

```bash
cd assignments/01-ai-core
cp .env.example .env
```

Fill in `.env`. Set `PORTKEY_API_KEY`, then pick **one** way for Portkey to
authenticate Anthropic:

| Mode                                | Config                                                      | When                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Saved integration** (recommended) | `PORTKEY_PROVIDER=@your-slug`                               | Create an Anthropic integration in Portkey; it stores the key, so `ANTHROPIC_API_KEY` can be blank. **Required** if your workspace has `block_inline_config` enabled. |
| Virtual key                         | `PORTKEY_VIRTUAL_KEY=vk-…`                                  | Portkey holds the credential behind a virtual key.                                                                                                                    |
| Inline                              | `PORTKEY_PROVIDER=anthropic` + `ANTHROPIC_API_KEY=sk-ant-…` | Only if your workspace permits inline provider config.                                                                                                                |

> ⚠️ Many Portkey workspaces enable `block_inline_config`, which rejects the inline
> mode with: _"Inline provider names are not allowed… Use a saved integration via
> '@slug'"_. Use the saved-integration mode there.

See [Configuration](#configuration-step-9) for every variable.

---

## Running it

```bash
# from assignments/01-ai-core
npm run dev        # watch mode (tsx)
npm start          # one-shot
npm test           # vitest
npm run typecheck  # tsc --noEmit

# To auto-load .env when running:
npx tsx --env-file=.env src/index.ts
```

The server boots even without AI keys (so `/health` works); a `/chat` call
without keys returns a clean `503 CONFIG_ERROR`.

---

## The API

### `GET /health`

```json
{ "status": "ok", "service": "01-ai-core" }
```

### `POST /chat`

Request:

```json
{ "message": "How many notes does the Orion Search project have?" }
```

Success response:

```json
{
  "answer": {
    "summary": "Orion Search (proj_orion) has 2 notes.",
    "confidence": 0.9,
    "shouldContinue": false,
    "sources": ["proj_orion"]
  },
  "meta": {
    "model": "claude-opus-4-8",
    "iterations": 2,
    "toolCalls": 1,
    "usage": { "inputTokens": 812, "outputTokens": 143 }
  }
}
```

Error response (same shape for every failure):

```json
{
  "error": {
    "code": "CONFIG_ERROR",
    "message": "PORTKEY_API_KEY is not set — cannot reach the AI gateway."
  }
}
```

---

## How each piece works

### Structured output (Step 2)

Claude must return the shape defined by
[`FinalAnswerSchema`](src/ai/schemas.ts) (`summary`, `confidence`,
`shouldContinue`, `sources`). We enforce it two ways:

1. **A `final_answer` tool** whose `input_schema` is derived from the Zod schema
   (single source of truth). The system prompt tells Claude to deliver its answer
   only by calling this tool — so it emits structured JSON, not prose.
2. **Zod validation** of that tool input in
   [`chatService.ts`](src/ai/chatService.ts). If validation fails, we throw
   `StructuredOutputError` → the route returns `502 STRUCTURED_OUTPUT_INVALID`.
   We do **not** crash.

There's also a fallback: if Claude ever returns plain text, we try
`JSON.parse` + Zod validate it, so a malformed answer is caught and reported
rather than passed through. (See the `chatService.test.ts` cases.)

### Tool use (Step 3)

Four tools operate over [`sampleData.json`](src/data/sampleData.json):

| Tool                  | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `search_notes`        | full-text search over notes                  |
| `get_project`         | fetch one project + its note/document counts |
| `search_documents`    | full-text search over documents              |
| `run_analytics_query` | run a read-only SQL SELECT (model-generated) |

Claude decides which to call. The manual tool-use loop lives in
[`chatService.ts`](src/ai/chatService.ts): it executes tool calls, returns
`tool_result`s, and loops until the model calls `final_answer` (or a safety
iteration cap trips).

### ToolContext (Step 4)

Every tool receives one [`ToolContext`](src/ai/toolContext.ts) — `{ data, logger,
user, config }` — instead of a long parameter list. This is lightweight DI: tools
depend on the context interface, so they're trivial to test with a fake context
(see [`tools.test.ts`](tests/tools.test.ts)).

### Tool factory (Step 5)

[`toolFactory.ts`](src/ai/toolFactory.ts) is a **registry**: each tool is one
object bundling name + description + Zod schema + handler. `dispatch()` looks a
tool up, **validates its input with Zod**, runs it, and returns a discriminated
result.

**Registry vs `switch`:** a `switch` is fine for 2–3 fixed tools and has zero
indirection. But it splits a tool's identity across the switch _and_ a parallel
schema list, so they drift, and you can't enumerate the tool set (needed to
advertise `tools` to Claude) without hand-maintaining that list. The registry
keeps everything in one object and derives the advertised JSON-Schema list from
the same definitions — the right call once tools are numerous or dynamic. The
tradeoff is a little indirection. Full write-up is in the file's header comment.

### SQL guardrails (Step 6)

[`guardrails.ts`](src/ai/guardrails.ts) exports `validateDynamicSql`, which:

1. strips block (`/* */`) and line (`--`, `#`) comments,
2. normalizes whitespace,
3. lowercases a **copy** for detection (the executed query keeps original case so
   string literals stay correct),
4. rejects multiple statements, anything that isn't a `SELECT`/`WITH`, and a
   denylist of dangerous keywords: `DROP`, `DELETE`, `ALTER`, `TRUNCATE`,
   `INSERT`, `UPDATE`, `UNION`, `CREATE`, `EXEC`, `INTO`, and more.

[`guardrails.test.ts`](tests/guardrails.test.ts) proves it against ~15 malicious
inputs (stacked statements, comment-smuggled keywords, `UNION SELECT`,
`INTO OUTFILE`, …) plus valid read-only queries.

**Why lexical, not semantic?** Lexical validation inspects the _text_ — it doesn't
parse the SQL or reason about what it _does_. That's a deliberate tradeoff:

- **Pros:** cheap, dialect-agnostic, and it **fails closed** — a coarse but
  reliable outer wall. No dependency on a specific SQL parser.
- **Cons:** it can't understand intent, so it has false positives (a benign
  `REPLACE()` function is blocked) and can't reason about table-level permissions.

So it isn't the _only_ defense. Real semantic safety is enforced at a **different
layer**: the query executes against an in-memory, read-only dataset (via alasql)
with no writer, no filesystem, and no network. Even if a cleverly-escaped
statement slipped past the lexical filter, the execution sandbox has nothing to
damage. That's **defense in depth** — a lexical wall in front of a powerless
execution environment.

### Error handling (Step 7)

Failures are values or typed errors, never crashes. The central
[`errorHandler`](src/utils/errorHandler.ts) maps each to a meaningful status:

| Scenario                   | Where it's handled                                         | HTTP                   |
| -------------------------- | ---------------------------------------------------------- | ---------------------- |
| Invalid request body       | Zod in the route                                           | `400 VALIDATION_ERROR` |
| Malformed JSON             | body parser                                                | `400 INVALID_JSON`     |
| Invalid tool arguments     | `dispatch()` → `tool_result(is_error)` (model can recover) | in-loop                |
| Unknown tool name          | `dispatch()` → `tool_result(is_error)`                     | in-loop                |
| SQL blocked by guardrail   | `dispatch()` → `tool_result(is_error)`                     | in-loop                |
| Model output not valid     | `StructuredOutputError`                                    | `502`                  |
| Portkey/Claude unavailable | `UpstreamAiError` / `ConfigError`                          | `502` / `503`          |
| Rate limited upstream      | `UpstreamAiError`                                          | `429`                  |

Tool-level failures are handed **back to the model** as `tool_result` errors so it
can adapt (rephrase a query, pick another tool) rather than aborting the request —
that's the graceful path. Request-level failures return the JSON error envelope.

---

## Configuration (Step 9)

Nothing is hardcoded — [`config/index.ts`](src/config/index.ts) reads and
Zod-validates all of it at startup. Provider and model are configuration, so
swapping them requires no code change.

| Variable                 | Default                     | Purpose                                             |
| ------------------------ | --------------------------- | --------------------------------------------------- |
| `PORT`                   | `3000`                      | HTTP port                                           |
| `LOG_LEVEL`              | `info`                      | `debug`/`info`/`warn`/`error`                       |
| `AI_PROVIDER`            | `anthropic`                 | logical provider name                               |
| `AI_MODEL`               | `claude-opus-4-8`           | model id                                            |
| `AI_MAX_TOKENS`          | `4096`                      | max output tokens                                   |
| `AI_THINKING`            | `disabled`                  | `adaptive` \| `disabled` (extended thinking)        |
| `AI_EFFORT`              | _(unset)_                   | `low`..`max` effort hint                            |
| `AI_MAX_TOOL_ITERATIONS` | `8`                         | tool-loop safety cap                                |
| `PORTKEY_API_KEY`        | —                           | Portkey gateway key (**required to call Claude**)   |
| `PORTKEY_BASE_URL`       | `https://api.portkey.ai/v1` | gateway URL                                         |
| `PORTKEY_PROVIDER`       | `anthropic`                 | upstream provider                                   |
| `PORTKEY_VIRTUAL_KEY`    | —                           | Portkey virtual key holding the provider credential |
| `ANTHROPIC_API_KEY`      | —                           | provider key (used if no virtual key)               |

Secrets are never logged — [`redactConfig`](src/config/index.ts) masks them.

---

## Testing

```bash
npm test
```

62 tests, all offline (no network / no API key needed):

- [`guardrails.test.ts`](tests/guardrails.test.ts) — malicious SQL is blocked; safe SQL passes.
- [`schemas.test.ts`](tests/schemas.test.ts) — structured-output + request validation.
- [`tools.test.ts`](tests/tools.test.ts) — tool handlers + dispatch error paths.
- [`chatService.test.ts`](tests/chatService.test.ts) — the full tool-use loop driven by a
  **scripted fake `LlmProvider`** (the payoff of the provider abstraction: the
  orchestration is testable with zero network).
- [`claude.test.ts`](tests/claude.test.ts) — the Anthropic adapter, driven by an **injected
  fake client**: content normalization, `raw` replay, request-param mapping,
  thinking/effort config, and error → HTTP-status mapping.
- [`http.test.ts`](tests/http.test.ts) — **supertest** over the real Express app + error
  handler: `POST /chat` 200 plus every error status (400 validation, 400 bad JSON,
  502 structured-output, 503 config, 404).

> These run against fakes, so they can't cover a real Claude round-trip. That path was
> verified **manually against the live gateway** (see below) — with keys configured, a
> `POST /chat` returns a validated answer from `claude-opus-4-8` via Portkey.

### Verified live

Confirmed end-to-end against the real gateway (`claude-opus-4-8` through Portkey):

| Scenario                                                                           | Result                                                                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Multi-turn tool use ("how many notes… what do they say about latency?")            | `200` — 4 tool calls, 4 iterations, correct facts + sources                                                             |
| Model-generated SQL ("aggregate notes per project")                                | `200` — Claude wrote a `SELECT`, guardrail passed it, alasql executed it, counts correct                                |
| Prompt-level refusal ("DROP TABLE notes; DELETE FROM projects")                    | `200` — Claude declined before ever calling the tool                                                                    |
| **Guardrail rejection in-loop** (forced `"SELECT * FROM notes; DROP TABLE notes"`) | tool returned `SQL_GUARDRAIL_BLOCKED: multiple statements are not allowed`; Claude recovered and reported it — no crash |

The last row is the defense-in-depth proof: even when the model _does_ emit dangerous SQL,
the guardrail blocks it, the error is handed back as a `tool_result`, and the request
completes gracefully.

---

## Project structure

```text
01-ai-core/
├── src/
│   ├── index.ts              # entrypoint (config -> wire graph -> listen)
│   ├── server.ts             # composition root + Express app
│   ├── routes/
│   │   └── chat.ts           # POST /chat (Step 8)
│   ├── ai/
│   │   ├── types.ts          # LlmProvider abstraction (the seam)
│   │   ├── gateway.ts        # Portkey-configured client (Step 1)
│   │   ├── claude.ts         # ClaudeProvider (the Anthropic mapping)
│   │   ├── chatService.ts    # tool-use loop + structured output
│   │   ├── prompts.ts        # system prompt
│   │   ├── schemas.ts        # Zod: output + tool inputs (Step 2)
│   │   ├── tools.ts          # the tools (Step 3)
│   │   ├── toolContext.ts    # shared state (Step 4)
│   │   ├── toolFactory.ts    # registry + dispatch (Step 5)
│   │   └── guardrails.ts     # validateDynamicSql (Step 6)
│   ├── config/
│   │   └── index.ts          # typed config (Step 9)
│   ├── data/
│   │   └── sampleData.json   # the local dataset
│   └── utils/
│       ├── httpError.ts      # HTTP error type
│       └── errorHandler.ts   # central error handler (Step 7)
└── tests/
```

Reusable logging comes from the workspace's
[`@flyrank/shared`](../../shared/) package.
