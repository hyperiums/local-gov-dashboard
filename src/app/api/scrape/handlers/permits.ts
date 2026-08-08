// Permit-related scrape handlers
import { NextResponse } from 'next/server';
import {
  getPermitPdfUrl,
  fetchPdfWithFallback,
  fetchPdfDiagnosed,
  parsePermitPdfText,
} from '@/lib/scraper';
import { analyzePdf } from '@/lib/summarize';
import { getRecentYears, getAllMonths } from '@/lib/dates';
import { insertPermit, replacePermitsForMonth, recordScrapeRun } from '@/lib/db';
import {
  parsePdf,
  formatError,
  hasSummary,
  VALID_MONTH,
  MAX_PDF_BASE64_BYTES,
  type HandlerParams,
} from './shared';

type PermitRow = {
  id: string;
  month: string;
  type?: string | null;
  address?: string | null;
  description?: string | null;
  value?: number | null;
  sourceUrl?: string | null;
  source_url?: string | null;
};

const MAX_IMPORT_PERMITS = 10000;
const MAX_STRING_LEN = 2000;

export async function handleImportPermits(params: HandlerParams) {
  // Upsert pre-fetched permit records. Used by scripts/push-permits.sh
  // to push permits scraped locally into prod, since the production IP
  // is blocked by the city's CDN. Same ADMIN_SECRET auth gate as every
  // other /api/scrape op.
  //
  // Accepts the snake_case `source_url` shape that comes straight out
  // of `sqlite3 -json` so callers don't have to rename columns.
  //
  // Optional `pdfsByMonth: { "YYYY-MM": "<base64>" }` triggers AI
  // summary generation for each month after rows are imported. The PDFs
  // are fetched on the local machine (where the city CDN isn't blocking
  // us) and the OpenAI call happens here on the server, so the API key
  // never leaves prod.
  const permits = (params?.permits as PermitRow[] | undefined) || [];
  if (!Array.isArray(permits)) {
    return NextResponse.json({ error: 'params.permits must be an array' }, { status: 400 });
  }
  if (permits.length > MAX_IMPORT_PERMITS) {
    return NextResponse.json(
      { error: `too many permits in one request (max ${MAX_IMPORT_PERMITS}, got ${permits.length})` },
      { status: 413 }
    );
  }

  const pdfsByMonth = (params?.pdfsByMonth as Record<string, string> | undefined) || {};
  if (typeof pdfsByMonth !== 'object' || Array.isArray(pdfsByMonth)) {
    return NextResponse.json({ error: 'params.pdfsByMonth must be an object' }, { status: 400 });
  }

  const isShortString = (v: unknown): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= MAX_STRING_LEN;
  // Optional text columns may legitimately be blank — a permit with no
  // subdivision or work class has an empty description, and the parser emits
  // "" for it. Requiring non-empty rejected those rows under a "too long"
  // message, which sent whoever read it looking for the wrong problem.
  const isOptionalText = (v: unknown): boolean =>
    v == null || (typeof v === 'string' && v.length <= MAX_STRING_LEN);
  const isValidMonth = (v: unknown): v is string =>
    typeof v === 'string' && VALID_MONTH.test(v);

  let imported = 0;
  const errors: { id?: string; error: string }[] = [];

  const validByMonth = new Map<string, Parameters<typeof insertPermit>[0][]>();
  for (const p of permits) {
    const sourceUrl = p.sourceUrl ?? p.source_url ?? '';
    if (!isShortString(p.id) || !isValidMonth(p.month) || !isShortString(sourceUrl)) {
      errors.push({ id: p.id, error: 'invalid id, month (YYYY-MM), or sourceUrl' });
      continue;
    }
    if (!isOptionalText(p.type)) { errors.push({ id: p.id, error: `type must be a string of at most ${MAX_STRING_LEN} characters` }); continue; }
    if (!isOptionalText(p.address)) { errors.push({ id: p.id, error: `address must be a string of at most ${MAX_STRING_LEN} characters` }); continue; }
    if (!isOptionalText(p.description)) { errors.push({ id: p.id, error: `description must be a string of at most ${MAX_STRING_LEN} characters` }); continue; }
    if (p.value != null && (typeof p.value !== 'number' || !Number.isFinite(p.value))) {
      errors.push({ id: p.id, error: 'value must be a finite number' }); continue;
    }
    const rows = validByMonth.get(p.month) || [];
    rows.push({
      id: p.id,
      month: p.month,
      type: p.type ?? undefined,
      address: p.address ?? undefined,
      description: p.description ?? undefined,
      value: p.value ?? undefined,
      sourceUrl,
    });
    validByMonth.set(p.month, rows);
  }

  // The push carries every row the source machine has for each month, so
  // each month is replaced wholesale — otherwise rows from earlier parses
  // of the same PDF would linger under their old ids.
  for (const [month, rows] of validByMonth) {
    try {
      replacePermitsForMonth(month, rows);
      imported += rows.length;
    } catch (err) {
      errors.push({ error: `month ${month}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const summaries: { month: string; success: boolean; error?: string }[] = [];
  const pdfMonths = Object.keys(pdfsByMonth);
  for (const month of pdfMonths) {
    if (!VALID_MONTH.test(month)) {
      summaries.push({ month, success: false, error: 'invalid month format (YYYY-MM)' });
      continue;
    }
    const pdfBase64 = pdfsByMonth[month];
    if (typeof pdfBase64 !== 'string' || !pdfBase64) {
      summaries.push({ month, success: false, error: 'pdfBase64 must be a non-empty string' });
      continue;
    }
    if (pdfBase64.length > MAX_PDF_BASE64_BYTES) {
      summaries.push({ month, success: false, error: `pdfBase64 too large (max ${MAX_PDF_BASE64_BYTES} chars)` });
      continue;
    }
    try {
      await analyzePdf(month, 'permit', pdfBase64, { forceRefresh: true });
      summaries.push({ month, success: true });
    } catch (err) {
      summaries.push({ month, success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const summaryErrors = summaries.filter(s => !s.success).length;

  // On a deployment whose IP the city's CDN refuses, this push — not the
  // cron's direct fetch — is how permits actually arrive, so it is the event
  // the feed-status line must count as a collection. Recording it here keeps
  // "last collected" true for whichever channel a given deploy relies on.
  recordScrapeRun({
    feed: 'permits',
    outcome: errors.length === 0 ? 'ok' : 'error',
    monthsAttempted: validByMonth.size,
    monthsIngested: validByMonth.size - errors.length,
    rowsIngested: imported,
    newestMonthIngested: [...validByMonth.keys()].sort().pop() ?? null,
    detail: { channel: 'import', received: permits.length, rejected: errors.length },
  });

  return NextResponse.json({
    success: errors.length === 0 && summaryErrors === 0,
    imported,
    received: permits.length,
    errors,
    summaries,
  });
}

export async function handlePermits(params: HandlerParams) {
  // Scrape permit PDFs for a given month
  const { year, month } = params || {};
  if (!year || !month) {
    return NextResponse.json({ error: 'year and month are required' }, { status: 400 });
  }

  const urls = getPermitPdfUrl(year as string, month as string);
  const result = await fetchPdfWithFallback(urls);

  if (!result) {
    return NextResponse.json({
      error: 'Permit PDF not found',
      triedUrls: urls,
    }, { status: 404 });
  }

  const pdfData = await parsePdf(result.buffer);
  const permits = parsePermitPdfText(pdfData.text, `${year}-${month}`, result.url);

  // Only replace the month when the parse produced something, so an
  // unrecognized future layout can't wipe previously-good rows
  if (permits.length > 0) {
    replacePermitsForMonth(`${year}-${month}`, permits);
  }

  return NextResponse.json({
    success: true,
    permitCount: permits.length,
    sourceUrl: result.url,
  });
}

export async function handleBulkPermits(params: HandlerParams) {
  // Scrape permits for multiple months, optionally multiple years
  const { year, years, months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] } = params || {};

  // Support either single year or array of years
  const yearsToProcess = (years as string[]) || (year ? [year as string] : null);
  if (!yearsToProcess) {
    return NextResponse.json({ error: 'year or years is required' }, { status: 400 });
  }

  // Each month lands in exactly one bucket. "not_published" is the only
  // benign absence; the others each mean something is broken, and lumping
  // them together under a blanket success:true is what kept a server that
  // could not reach the city's CDN reporting clean runs twice a week.
  type MonthOutcome =
    | 'ingested'
    | 'parsed_empty'
    | 'not_machine_readable'
    | 'not_published'
    | 'unreachable'
    | 'error';
  const allResults: {
    year: string;
    month: string;
    outcome: MonthOutcome;
    permitCount?: number;
    sourceUrl?: string;
    error?: string;
  }[] = [];

  for (const y of yearsToProcess) {
    for (const month of months as string[]) {
      const monthKey = `${y}-${month}`;
      try {
        const fetched = await fetchPdfDiagnosed(getPermitPdfUrl(y, month));

        if (!fetched.ok) {
          allResults.push({ year: y, month, outcome: fetched.reason, error: fetched.detail });
          continue;
        }

        const pdfData = await parsePdf(fetched.buffer);

        // Jan and Feb 2023 were scanned from paper rather than exported, so
        // they carry no text layer at all. That is a property of what the
        // city published, not a parser fault, and calling it a parse failure
        // would leave a permanent false alarm on two months that can never
        // improve without OCR.
        if (pdfData.text.trim().length === 0) {
          allResults.push({
            year: y,
            month,
            outcome: 'not_machine_readable',
            sourceUrl: fetched.url,
            error: 'published as a scanned image with no extractable text',
          });
          continue;
        }

        const permits = parsePermitPdfText(pdfData.text, monthKey, fetched.url);

        if (permits.length === 0) {
          // We hold the document and could not read a single record from it.
          // Silence here would be indistinguishable from a quiet month.
          allResults.push({
            year: y,
            month,
            outcome: 'parsed_empty',
            permitCount: 0,
            sourceUrl: fetched.url,
            error: 'listing downloaded but no records parsed',
          });
          continue;
        }

        replacePermitsForMonth(monthKey, permits);
        allResults.push({
          year: y,
          month,
          outcome: 'ingested',
          permitCount: permits.length,
          sourceUrl: fetched.url,
        });
      } catch (error) {
        allResults.push({ year: y, month, outcome: 'error', error: formatError(error) });
      }
    }
  }

  const tally = (outcome: MonthOutcome) => allResults.filter((r) => r.outcome === outcome).length;
  const ingested = allResults.filter((r) => r.outcome === 'ingested');
  const totalPermits = ingested.reduce((sum, r) => sum + (r.permitCount || 0), 0);
  const newestMonthIngested = ingested
    .map((r) => `${r.year}-${r.month}`)
    .sort()
    .pop() ?? null;

  // Worst outcome wins: an unreachable source is a fetch failure regardless
  // of how many other months parsed fine.
  const runOutcome =
    tally('unreachable') > 0 ? 'unreachable'
    : tally('error') > 0 ? 'error'
    : tally('parsed_empty') > 0 ? 'parsed_empty'
    : 'ok';

  recordScrapeRun({
    feed: 'permits',
    outcome: runOutcome,
    monthsAttempted: allResults.length,
    monthsIngested: ingested.length,
    rowsIngested: totalPermits,
    newestMonthIngested,
    detail: {
      years: yearsToProcess,
      unreachable: tally('unreachable'),
      notPublished: tally('not_published'),
      notMachineReadable: tally('not_machine_readable'),
      parsedEmpty: tally('parsed_empty'),
      errors: tally('error'),
      firstFailure: allResults.find((r) => r.outcome === 'unreachable' || r.outcome === 'error')?.error,
    },
  });

  // success reflects whether collection worked. Finding nothing new because
  // the city has not posted it yet is a success; being unable to look is not.
  return NextResponse.json({
    success: runOutcome === 'ok',
    outcome: runOutcome,
    years: yearsToProcess,
    totalPermits,
    monthsIngested: ingested.length,
    monthsNotPublished: tally('not_published'),
    monthsNotMachineReadable: tally('not_machine_readable'),
    monthsUnreachable: tally('unreachable'),
    monthsParsedEmpty: tally('parsed_empty'),
    results: allResults,
  });
}

export async function handleGeneratePermitSummaries(params: HandlerParams) {
  // Generate AI summaries for monthly permit reports
  const { years = getRecentYears(2), months = getAllMonths(), forceRefresh = false } = params || {};

  const results: { month: string; success: boolean; error?: string }[] = [];

  for (const year of years as string[]) {
    for (const month of months as string[]) {
      const monthKey = `${year}-${month}`;

      try {
        // Check if we already have a summary (unless forcing refresh)
        if (!forceRefresh && hasSummary('permit', monthKey)) {
          results.push({ month: monthKey, success: true, error: 'Already exists (skipped)' });
          continue;
        }

        // Try to fetch the permit PDF
        const urls = getPermitPdfUrl(year, month);
        const pdfResult = await fetchPdfWithFallback(urls);

        if (!pdfResult) {
          results.push({ month: monthKey, success: false, error: 'PDF not found' });
          continue;
        }

        // Convert to base64 and analyze
        const pdfBase64 = pdfResult.buffer.toString('base64');
        console.log(`Analyzing permits for ${monthKey}...`);

        await analyzePdf(monthKey, 'permit', pdfBase64, { forceRefresh: forceRefresh as boolean });

        results.push({ month: monthKey, success: true });
        console.log(`Generated summary for ${monthKey}`);

      } catch (error) {
        results.push({
          month: monthKey,
          success: false,
          error: formatError(error),
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    successful: results.filter(r => r.success && r.error !== 'Already exists (skipped)').length,
    skipped: results.filter(r => r.error === 'Already exists (skipped)').length,
    results,
  });
}
