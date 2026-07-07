import { describe, expect, it } from 'vitest';
import { SqlGuardrailError, assertSafeSql, validateDynamicSql } from '../src/ai/guardrails.ts';

describe('validateDynamicSql — allows safe read-only queries', () => {
  const allowed = [
    'SELECT * FROM notes',
    "SELECT id, name FROM projects WHERE status = 'active'",
    'SELECT projectId, COUNT(*) AS c FROM notes GROUP BY projectId',
    'select * from documents order by updatedAt desc limit 5',
    'WITH recent AS (SELECT * FROM notes) SELECT * FROM recent',
    'SELECT * FROM notes;', // single trailing semicolon is tolerated
    'SELECT * FROM notes -- trailing comment is stripped',
  ];

  for (const sql of allowed) {
    it(`allows: ${sql}`, () => {
      const result = validateDynamicSql(sql);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.normalized.length).toBeGreaterThan(0);
    });
  }
});

describe('validateDynamicSql — blocks dangerous / malicious queries', () => {
  const blocked: Array<[string, string]> = [
    ['DROP TABLE notes', 'drop'],
    ['DELETE FROM notes', 'delete'],
    ['UPDATE notes SET text = "x"', 'update'],
    ["INSERT INTO notes VALUES ('x')", 'insert'],
    ['ALTER TABLE notes ADD col int', 'alter'],
    ['TRUNCATE TABLE notes', 'truncate'],
    ['CREATE TABLE evil (id int)', 'create'],
    // stacked statement smuggled after a valid SELECT
    ['SELECT * FROM notes; DROP TABLE notes', 'multiple statements'],
    // classic UNION-based injection
    ['SELECT id FROM notes UNION SELECT password FROM users', 'union'],
    // keyword hidden inside a block comment then continued
    ['SELECT * FROM notes /* comment */ ; DELETE FROM notes', 'multiple statements'],
    // line comment trying to hide a second statement
    ['SELECT * FROM notes\n-- ok\n; DROP TABLE notes', 'multiple statements'],
    // write disguised via SELECT ... INTO
    ['SELECT * INTO backup FROM notes', 'into'],
    // file exfiltration
    ["SELECT text INTO OUTFILE '/tmp/x' FROM notes", 'into'],
    // stored-proc / exec
    ['EXEC sp_who', 'exec'],
    // dangerous keyword that also isn't a SELECT
    ['PRAGMA table_info(notes)', 'pragma'],
    // empty / comment-only
    ['', 'empty'],
    ['/* just a comment */', 'comments'],
  ];

  for (const [sql, expectedFragment] of blocked) {
    it(`blocks: ${sql.slice(0, 48)}`, () => {
      const result = validateDynamicSql(sql);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.toLowerCase()).toContain(expectedFragment);
    });
  }
});

describe('validateDynamicSql — normalization details', () => {
  it('strips comments and collapses whitespace but preserves literal case', () => {
    const result = validateDynamicSql("SELECT   *  FROM notes  WHERE status = 'Active' -- note");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toBe("SELECT * FROM notes WHERE status = 'Active'");
      // Case-sensitive literal is untouched (we lowercase only for detection).
      expect(result.normalized).toContain("'Active'");
    }
  });
});

describe('assertSafeSql', () => {
  it('returns the normalized query for safe SQL', () => {
    expect(assertSafeSql('SELECT * FROM notes;')).toBe('SELECT * FROM notes');
  });

  it('throws SqlGuardrailError for unsafe SQL', () => {
    expect(() => assertSafeSql('DROP TABLE notes')).toThrow(SqlGuardrailError);
    try {
      assertSafeSql('DELETE FROM notes');
    } catch (err) {
      expect(err).toBeInstanceOf(SqlGuardrailError);
      expect((err as SqlGuardrailError).code).toBe('SQL_GUARDRAIL_BLOCKED');
    }
  });
});
