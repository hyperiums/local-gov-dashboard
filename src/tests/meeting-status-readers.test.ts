import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

// meetings.status is written at scrape time and lags the calendar until the
// next re-capture; readers derive upcoming/past from the date (withDateStatus
// in src/lib/db.ts). This keeps a SQL filter on the stored column from
// slipping back into server code.
const SERVER_DIRS = ['src/lib', 'src/app/api'];

const STATUS_COMPARISON = /\b(?:(\w+)\.)?status\s*(?:[!<>]?=|<>|(?:NOT\s+)?IN\b)/g;
const STATEMENT_START = /\b(SELECT|UPDATE|INSERT|DELETE)\b/g;
const READS_MEETINGS = /\b(?:FROM|JOIN)\s+meetings\b/;
const MEETINGS_QUALIFIERS = new Set(['m', 'meetings']);

const blank = (text: string) => text.replace(/[^\n]/g, ' ');

// SQL lives in string and template literals; blanking everything else (at the
// same offsets, so line numbers survive) keeps TypeScript such as
// `status === 'past'` or a `status = 'all'` default out of the search.
function literalTextOnly(source: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') {
        out += blank(source.slice(i, i + 2));
        i++;
      } else if (ch === quote || (ch === '\n' && quote !== '`')) {
        quote = null;
        out += blank(ch);
      } else {
        out += ch;
      }
    } else if (source.startsWith('//', i) || source.startsWith('/*', i)) {
      const lineComment = source[i + 1] === '/';
      const close = lineComment ? source.indexOf('\n', i) : source.indexOf('*/', i + 2);
      const stop = close === -1 ? source.length : lineComment ? close : close + 2;
      out += blank(source.slice(i, stop));
      i = stop - 1;
    } else {
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      out += blank(ch);
    }
  }
  return out;
}

// A subquery that closes before the comparison is not the comparison's
// statement: `UPDATE ordinances SET adopted_date = (SELECT ... JOIN meetings m
// ...), status = 'adopted'` writes the ordinance's status.
function withoutClosedGroups(sql: string): string {
  let previous: string;
  let current = sql;
  do {
    previous = current;
    current = current.replace(/\([^()]*\)/g, blank);
  } while (current !== previous);
  return current;
}

// A comparison is checked against the statement it belongs to: the text from
// the nearest SELECT/UPDATE/INSERT/DELETE before it. That spans `query +=`
// builders, and keeps getOrdinances' `WHERE status = ?` (FROM ordinances) and
// writes of the column (UPDATE/INSERT) out of it.
function storedMeetingStatusReads(source: string): number[] {
  const sql = literalTextOnly(source);
  const offendingLines: number[] = [];
  for (const comparison of sql.matchAll(STATUS_COMPARISON)) {
    const qualifier = comparison[1];
    const before = sql.slice(0, comparison.index);
    const statementStart = [...withoutClosedGroups(before).matchAll(STATEMENT_START)].at(-1);
    const isWrite = statementStart?.[1] === 'UPDATE' || statementStart?.[1] === 'INSERT';
    const statement = statementStart ? before.slice(statementStart.index) : '';
    const readsStoredStatus = qualifier
      ? MEETINGS_QUALIFIERS.has(qualifier)
      : !isWrite && READS_MEETINGS.test(statement);
    if (readsStoredStatus) {
      offendingLines.push(before.split('\n').length);
    }
  }
  return offendingLines;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('meetings.status readers', () => {
  it('no server code filters on the stored meeting status', () => {
    const offenders: string[] = [];
    for (const dir of SERVER_DIRS) {
      for (const file of sourceFiles(path.join(process.cwd(), dir))) {
        const source = readFileSync(file, 'utf8');
        const lines = source.split('\n');
        for (const line of storedMeetingStatusReads(source)) {
          offenders.push(`${path.relative(process.cwd(), file)}:${line}: ${lines[line - 1].trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the stored-status guard', () => {
  it('flags an aliased bound-parameter filter', () => {
    expect(storedMeetingStatusReads("db.prepare('SELECT * FROM meetings m WHERE m.status = ?')")).toEqual([1]);
  });

  it('flags an unaliased filter added by a query builder', () => {
    const source = [
      "let query = 'SELECT id, title FROM meetings WHERE 1=1';",
      "if (status) query += ' AND status = ?';",
    ].join('\n');
    expect(storedMeetingStatusReads(source)).toEqual([2]);
  });

  it('flags a filter inside an open subquery on meetings', () => {
    const source = "`SELECT * FROM agenda_items WHERE EXISTS (SELECT 1 FROM meetings WHERE status = 'past')`";
    expect(storedMeetingStatusReads(source)).toEqual([1]);
  });

  it('flags a literal status filter on a joined meetings table', () => {
    const source = "`SELECT a.id FROM agenda_items a JOIN meetings m ON m.id = a.meeting_id WHERE m.status = 'past'`";
    expect(storedMeetingStatusReads(source)).toEqual([1]);
  });

  it('leaves the ordinances status filter alone', () => {
    const source = [
      "let query = 'SELECT * FROM ordinances';",
      "if (options?.status) query += ' WHERE status = ?';",
    ].join('\n');
    expect(storedMeetingStatusReads(source)).toEqual([]);
  });

  it('leaves writes of the column and TypeScript comparisons alone', () => {
    const source = [
      "const { status = 'all' } = params;",
      "if (status === 'upcoming') db.prepare('SELECT id FROM meetings WHERE date >= ?');",
      "db.prepare('UPDATE meetings SET status = ? WHERE id = ?');",
      "db.prepare('UPDATE resolutions SET status = ? WHERE id = ?');",
      "db.prepare(`UPDATE ordinances SET adopted_date = (SELECT m.date FROM meetings m LIMIT 1), status = 'adopted'`);",
    ].join('\n');
    expect(storedMeetingStatusReads(source)).toEqual([]);
  });
});
