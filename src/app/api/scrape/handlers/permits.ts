// Permit-related scrape handlers
import { NextResponse } from 'next/server';
import {
  getPermitPdfUrl,
  fetchPdfWithFallback,
  parsePermitPdfText,
} from '@/lib/scraper';
import { analyzePdf } from '@/lib/summarize';
import { getRecentYears, getAllMonths } from '@/lib/dates';
import { insertPermit, getDb } from '@/lib/db';
import { parsePdf, formatError, hasSummary, type HandlerParams } from './shared';

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// Cap on base64 PDF size accepted per month in import-permits. Real
// monthly permit PDFs from Flowery Branch are ~80KB binary / ~110KB
// base64, so 5MB is a comfortable ceiling that still bounds memory.
const MAX_PDF_BASE64_BYTES = 5 * 1024 * 1024;

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
  const isValidMonth = (v: unknown): v is string =>
    typeof v === 'string' && VALID_MONTH.test(v);

  let imported = 0;
  const errors: { id?: string; error: string }[] = [];
  const db = getDb();

  const tx = db.transaction((rows: PermitRow[]) => {
    for (const p of rows) {
      const sourceUrl = p.sourceUrl ?? p.source_url ?? '';
      if (!isShortString(p.id) || !isValidMonth(p.month) || !isShortString(sourceUrl)) {
        errors.push({ id: p.id, error: 'invalid id, month (YYYY-MM), or sourceUrl' });
        continue;
      }
      if (p.type != null && !isShortString(p.type)) { errors.push({ id: p.id, error: 'type too long' }); continue; }
      if (p.address != null && !isShortString(p.address)) { errors.push({ id: p.id, error: 'address too long' }); continue; }
      if (p.description != null && !isShortString(p.description)) { errors.push({ id: p.id, error: 'description too long' }); continue; }
      if (p.value != null && (typeof p.value !== 'number' || !Number.isFinite(p.value))) {
        errors.push({ id: p.id, error: 'value must be a finite number' }); continue;
      }
      try {
        insertPermit({
          id: p.id,
          month: p.month,
          type: p.type ?? undefined,
          address: p.address ?? undefined,
          description: p.description ?? undefined,
          value: p.value ?? undefined,
          sourceUrl,
        });
        imported++;
      } catch (err) {
        errors.push({ id: p.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });
  tx(permits);

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

  for (const permit of permits) {
    insertPermit(permit);
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

  const allResults: { year: string; month: string; success: boolean; permitCount?: number; sourceUrl?: string; error?: string }[] = [];

  for (const y of yearsToProcess) {
    for (const month of months as string[]) {
      try {
        const urls = getPermitPdfUrl(y, month);
        const result = await fetchPdfWithFallback(urls);

        if (result) {
          const pdfData = await parsePdf(result.buffer);
          const permits = parsePermitPdfText(pdfData.text, `${y}-${month}`, result.url);

          for (const permit of permits) {
            insertPermit(permit);
          }

          allResults.push({
            year: y,
            month,
            success: true,
            permitCount: permits.length,
            sourceUrl: result.url,
          });
        } else {
          allResults.push({
            year: y,
            month,
            success: false,
            error: 'PDF not found',
          });
        }
      } catch (error) {
        allResults.push({
          year: y,
          month,
          success: false,
          error: formatError(error),
        });
      }
    }
  }

  const totalPermits = allResults.filter(r => r.success).reduce((sum, r) => sum + (r.permitCount || 0), 0);

  return NextResponse.json({
    success: true,
    years: yearsToProcess,
    totalPermits,
    successfulMonths: allResults.filter(r => r.success).length,
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
