// Permit-related scrape handlers
import { NextResponse } from 'next/server';
import {
  getPermitPdfUrl,
  fetchPdfWithFallback,
  parsePermitPdfText,
} from '@/lib/scraper';
import { analyzePdf } from '@/lib/summarize';
import { getRecentYears, getAllMonths } from '@/lib/dates';
import { insertPermit } from '@/lib/db';
import { parsePdf, formatError, hasSummary, type HandlerParams } from './shared';

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
