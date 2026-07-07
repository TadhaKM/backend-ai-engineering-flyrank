/**
 * Security guardrails for model-generated SQL.
 *
 * `validateDynamicSql` is a *lexical* filter: it inspects the text of a query
 * and rejects anything that isn't a single read-only SELECT. It does NOT
 * understand SQL semantics — it doesn't build a parse tree, resolve tables, or
 * reason about what the query *does*. See the README ("Why lexical, not
 * semantic") for why that tradeoff is the right one here:
 *
 *   - Lexical checks are cheap, dialect-agnostic, and fail closed. They are a
 *     coarse but reliable outer wall.
 *   - Real semantic safety (this query only touches read-only tables, can't
 *     escalate) is enforced at a DIFFERENT layer — we execute against an
 *     in-memory, read-only dataset with no writer, no filesystem, no network.
 *
 * Defense in depth: even if a cleverly-escaped statement slipped past the
 * lexical filter, the execution sandbox has nothing to damage.
 */
import { AppError } from '@flyrank/shared';

/** Thrown when a query is rejected. Carries a machine-readable reason. */
export class SqlGuardrailError extends AppError {
  readonly reason: string;
  constructor(reason: string, context?: Record<string, unknown>) {
    super('SQL_GUARDRAIL_BLOCKED', `Blocked unsafe SQL: ${reason}`, context);
    this.reason = reason;
  }
}

/** Keywords that have no place in a read-only analytics query. Matched as whole
 *  words, so a column like `createdAt` never trips `\bcreate\b`. */
const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'drop',
  'alter',
  'truncate',
  'create',
  'replace',
  'rename',
  'grant',
  'revoke',
  'attach',
  'detach',
  'pragma',
  'vacuum',
  'reindex',
  'exec',
  'execute',
  'call',
  'merge',
  'into', // blocks `SELECT ... INTO` (a write) and `OUTFILE INTO`
  'union', // blocks the classic `UNION SELECT` injection vector
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'load_file',
  'outfile',
  'dumpfile',
] as const;

const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join('|')})\\b`);

const MAX_SQL_LENGTH = 2000;

export type SqlValidation = { ok: true; normalized: string } | { ok: false; reason: string };

/**
 * Validate a candidate SQL string. Pure and side-effect free.
 *
 * Returns the normalized (comment-stripped, whitespace-collapsed) query on
 * success. The normalized query preserves the ORIGINAL case — we lowercase only
 * a throwaway copy for keyword detection, because string literals in the query
 * (e.g. `WHERE status = 'active'`) are case-sensitive against the data.
 */
export function validateDynamicSql(raw: string): SqlValidation {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'empty query' };
  }
  if (raw.length > MAX_SQL_LENGTH) {
    return { ok: false, reason: 'query exceeds maximum length' };
  }

  // 1. Strip block comments  /* ... */  (a common way to smuggle keywords).
  let stripped = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // 2. Strip line comments  -- ...  and  # ...  to end of line.
  stripped = stripped.replace(/--[^\n]*/g, ' ').replace(/#[^\n]*/g, ' ');
  // 3. Collapse all whitespace to single spaces and trim.
  stripped = stripped.replace(/\s+/g, ' ').trim();
  if (stripped === '') {
    return { ok: false, reason: 'query was only comments or whitespace' };
  }

  // Allow (and drop) a single trailing semicolon; any other semicolon means
  // stacked statements.
  const normalized = stripped.replace(/;\s*$/, '');

  // 4. Lowercase a COPY for keyword detection only (never for execution).
  const lower = normalized.toLowerCase();

  if (lower.includes(';')) {
    return { ok: false, reason: 'multiple statements are not allowed' };
  }
  // Check dangerous keywords before the "must be a SELECT" rule so the reason is
  // specific (e.g. "forbidden keyword drop") rather than a generic "only SELECT".
  const match = FORBIDDEN_RE.exec(lower);
  if (match) {
    return { ok: false, reason: `forbidden keyword "${match[1]}"` };
  }
  if (!/^(select|with)\b/.test(lower)) {
    return { ok: false, reason: 'only read-only SELECT queries are allowed' };
  }

  return { ok: true, normalized };
}

/** Throwing wrapper: returns the normalized query or throws {@link SqlGuardrailError}. */
export function assertSafeSql(raw: string): string {
  const result = validateDynamicSql(raw);
  if (!result.ok) {
    throw new SqlGuardrailError(result.reason, { query: raw });
  }
  return result.normalized;
}
