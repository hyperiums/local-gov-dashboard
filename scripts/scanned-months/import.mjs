// Load the hand-checked transcriptions of the scanned months into the local
// database. See README.md for how the rows were produced and why they cannot
// come from the parser.
//
//   node scripts/scanned-months/import.mjs
//
// Rewrites each month wholesale, so re-running is safe and edits to the TSV
// take effect. Push to production afterwards with scripts/push-permits.sh.

import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const db = new Database(path.join(repoRoot, 'data', 'flowery-branch.db'));

const SOURCE_URL = (month) => {
  const [year, mm] = month.split('-');
  const name = { '01': 'jan', '02': 'feb' }[mm];
  return `https://www.flowerybranchga.org/Documents/Departments/Community%20Development/`
    + `Monthly%20Permit%20Statistics/${year}/${name}${year}permitlisting.pdf`;
};

const replaceMonth = db.transaction((month, rows) => {
  db.prepare('DELETE FROM permits WHERE month = ?').run(month);
  const insert = db.prepare(`
    INSERT INTO permits (id, month, type, address, description, value, source_url)
    VALUES (@id, @month, @type, @address, @description, @value, @source_url)
  `);
  for (const row of rows) insert.run(row);
});

let imported = 0;
const months = [];

for (const file of readdirSync(here).filter((f) => f.endsWith('.tsv')).sort()) {
  const month = path.basename(file, '.tsv');
  const rows = readFileSync(path.join(here, file), 'utf-8')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [permit, type, address, description, value] = line.split('\t');
      return {
        id: `permit-${month}-${permit}`,
        month,
        type,
        address,
        // null, not "", for an absent column: insertPermit stores null for a
        // blank description on every other month, and the two should match.
        description: description || null,
        // Only the "BY TYPE" layout carries a valuation column; the "Permit
        // Report" layout has none, and an absent column must stay null rather
        // than becoming a zero the report never printed.
        value: value === undefined || value === '' ? null : Number(value),
        source_url: SOURCE_URL(month),
      };
    });

  replaceMonth(month, rows);
  months.push(`${month} (${rows.length})`);
  imported += rows.length;
  console.log(`${month}: ${rows.length} rows`);
}

db.prepare(`
  INSERT INTO scrape_runs
    (feed, outcome, months_attempted, months_ingested, rows_ingested, newest_month_ingested, detail)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  'permits',
  'ok',
  months.length,
  months.length,
  imported,
  months.length ? months[months.length - 1].split(' ')[0] : null,
  JSON.stringify({ channel: 'ocr-transcription', months, see: 'scripts/scanned-months/README.md' })
);

console.log(`\nImported ${imported} rows across ${months.length} scanned month(s).`);
console.log('Recorded a scrape_runs entry with channel "ocr-transcription".');
db.close();
