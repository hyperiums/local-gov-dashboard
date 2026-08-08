import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { extractText } from 'unpdf';
import path from 'path';
import { getPermitPdfUrl, parsePermitPdfText } from '@/lib/scraper/permits';

// Audits the stored permit rows against each report's own printed total.
//
// Every layout states its own count — "Total Records: N", "GRAND TOTAL OF
// PERMITS: N", or per-type subtotals that sum to it — which makes the city
// the arbiter of whether the parser read a month correctly. That catches both
// halves of the failure this was written after: records invented out of
// unrelated text, and records dropped because a layout went unrecognised.
//
// Skipped by default because it downloads ~80 PDFs from the city's host, and
// that host answers some datacentre IPs with 403. Run it deliberately, from a
// machine that can reach the site:
//
//   AUDIT_PERMITS=1 npx vitest run src/tests/permit-audit.test.ts
//
// A disagreement is not automatically a parser bug — the March 2023 report
// prints "Total Records: 28" above 27 listed rows — but each one wants a human
// looking at the PDF.
const ENABLED = process.env.AUDIT_PERMITS === '1';

// Months where the city's own footer disagrees with the rows it printed.
// March 2023 and September 2024 were counted off the rendered pages — 27 rows
// under a "Total Records: 28", and 21 rows under a "Total Records: 20" — so
// the footer is wrong in both directions. July 2023 and October 2024 carry the
// same signature: the text holds exactly the number of records we read, with
// unbroken permit numbering and no unmatched record starts.
//
// Listed so the audit stays green on what is understood and shouts about what
// is not. Removing an entry is how you re-open the question.
// Months the city published as scans with no text layer, recovered by OCR and
// human review instead of by the parser. Counts come from the totals each
// report prints itself. See scripts/scanned-months/README.md.
const TRANSCRIBED_FROM_SCANS: Record<string, number> = {
  '2023-01': 2,
  '2023-02': 19,
};

const KNOWN_FOOTER_DISAGREEMENTS: Record<string, { prints: number; reads: number }> = {
  '2023-03': { prints: 28, reads: 27 },
  '2023-07': { prints: 43, reads: 42 },
  '2024-09': { prints: 20, reads: 21 },
  '2024-10': { prints: 59, reads: 58 },
};
const FIRST = process.env.AUDIT_FROM ?? '2020-01';
const LAST = process.env.AUDIT_TO ?? new Date().toISOString().slice(0, 7);

function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (m === 12) { y += 1; m = 1; } else { m += 1; }
  }
  return out;
}

function printedTotal(text: string): number | null {
  const explicit = text.match(/Total Records:\s*(\d+)/i)
    ?? text.match(/GRAND TOTAL OF PERMITS:\s*(\d+)/i);
  if (explicit) return Number(explicit[1]);

  const perType = [...text.matchAll(/PERMITS ISSUED FOR [A-Z()&/ -]+:\s*(\d+)/gi)];
  if (perType.length) return perType.reduce((sum, m) => sum + Number(m[1]), 0);

  return null;
}

async function fetchReport(month: string): Promise<{ text: string; url: string } | null> {
  const [year, mm] = month.split('-');
  for (const url of getPermitPdfUrl(year, mm)) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FloweryBranchCivicDashboard/1.0 (audit)' },
    }).catch(() => null);
    if (!res?.ok) continue;
    const result = await extractText(new Uint8Array(await res.arrayBuffer()));
    return { text: Array.isArray(result.text) ? result.text.join('\n') : result.text, url };
  }
  return null;
}

describe.runIf(ENABLED)('permit rows against each report\'s printed total', () => {
  it('agrees with every report the city publishes', async () => {
    const db = new Database(path.join(process.cwd(), 'data', 'flowery-branch.db'), { readonly: true });
    const stored = new Map(
      (db.prepare('SELECT month, COUNT(*) n FROM permits GROUP BY month').all() as
        { month: string; n: number }[]).map((r) => [r.month, r.n])
    );

    const disagreements: string[] = [];
    let compared = 0;

    for (const month of monthsBetween(FIRST, LAST)) {
      const have = stored.get(month) ?? 0;
      const report = await fetchReport(month);

      if (!report) {
        if (have) disagreements.push(`${month}: ${have} rows stored but no report is published`);
        continue;
      }

      if (report.text.trim().length === 0) {
        // A scan carries nothing to parse, so rows for one can only have come
        // from the transcriptions in scripts/scanned-months. Their counts are
        // still checked against what the report prints; anything else stored
        // for such a month was invented.
        const transcribed = TRANSCRIBED_FROM_SCANS[month];
        if (transcribed === undefined) {
          if (have) disagreements.push(`${month}: ${have} rows stored from a report with no text layer`);
        } else if (have !== transcribed) {
          disagreements.push(
            `${month}: transcription should hold ${transcribed} rows, database has ${have}`
          );
        }
        continue;
      }

      const expected = printedTotal(report.text);
      // Re-parsing here rather than trusting the row count alone means the
      // audit also fails if the parser has drifted since the rows were written.
      const reparsed = parsePermitPdfText(report.text, month, report.url).length;

      if (reparsed !== have) {
        disagreements.push(`${month}: ${have} rows stored but the report re-parses to ${reparsed}`);
      }
      if (expected !== null) {
        compared += 1;
        const known = KNOWN_FOOTER_DISAGREEMENTS[month];
        if (known && known.prints === expected && known.reads === reparsed) continue;
        if (known) {
          // The month is known to disagree, but not by this much any more —
          // either the city republished it or the parser moved.
          disagreements.push(
            `${month}: known disagreement changed — was ${known.prints}/${known.reads}, now prints ${expected}, reads ${reparsed}`
          );
          continue;
        }
        if (expected !== reparsed) {
          disagreements.push(`${month}: report prints ${expected}, parser reads ${reparsed}`);
        }
      }
    }

    db.close();
    console.log(`Audited ${compared} months carrying a printed total, ${FIRST}..${LAST}`);
    expect(disagreements).toEqual([]);
  }, 900_000);
});
