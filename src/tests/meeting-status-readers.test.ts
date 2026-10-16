import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

// meetings.status is written at scrape time and lags the calendar until the
// next re-capture; readers derive upcoming/past from the date (withDateStatus
// in src/lib/db.ts). This keeps a SQL filter on the stored column from
// slipping back into server code.
const SERVER_DIRS = ['src/lib', 'src/app/api'];
const STORED_STATUS_READS = [/\bstatus\s*=\s*'(upcoming|past)'/, /\bm\.status\s*=/];

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
        readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
          if (STORED_STATUS_READS.some(pattern => pattern.test(line))) {
            offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
