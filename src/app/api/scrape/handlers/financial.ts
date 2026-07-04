// Financial document scrape handlers (budgets, audits, business reports)
import { NextResponse } from 'next/server';
import {
  scrapeFinancialReports,
  getFinancialDocumentsByType,
  getBusinessPdfUrl,
  fetchPdfWithFallback,
} from '@/lib/scraper';
import { fetchPdfAsBase64, analyzePdf } from '@/lib/summarize';
import { getRecentYears, getAllMonths } from '@/lib/dates';
import {
  formatError,
  hasSummary,
  VALID_MONTH,
  MAX_PDF_BASE64_BYTES,
  type HandlerParams,
} from './shared';
import { getSummaryMetadata, updateSummaryMetadata } from '@/lib/db';

export async function handleFinancial() {
  // Scrape financial report links
  const reports = await scrapeFinancialReports();

  return NextResponse.json({
    success: true,
    reportCount: reports.length,
    reports,
  });
}

type ModelOption = 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4-turbo';

export async function handleGenerateBudgetSummaries(params: HandlerParams) {
  // Generate AI summaries for annual budget documents
  // Dynamically scrapes the city's Financial Reports page for budget PDFs
  const { forceRefresh = false, limit, model: modelParam = 'gpt-4o-mini' } = params || {};
  const model = modelParam as ModelOption;

  // Dynamically discover budget documents from city website
  console.log('Discovering budget documents from city website...');
  let budgetDocuments = await getFinancialDocumentsByType('budget');
  console.log(`Found ${budgetDocuments.length} budget documents`);

  // Apply limit if specified (useful for testing)
  if (limit && (limit as number) > 0) {
    budgetDocuments = budgetDocuments.slice(0, limit as number);
    console.log(`Limited to ${budgetDocuments.length} documents for processing`);
  }

  if (budgetDocuments.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'No budget documents found on city website',
    }, { status: 404 });
  }

  const results: { fiscalYear: string; success: boolean; error?: string; url?: string; model?: string }[] = [];

  for (const doc of budgetDocuments) {
    try {
      // Skip only when the summary exists AND still describes the same
      // source PDF — when the adopted budget book replaces the proposed
      // one for a fiscal year, the URL changes and the summary must be
      // regenerated from the new document
      const storedMeta = getSummaryMetadata('budget', doc.fiscalYear, 'pdf-analysis');
      const sameSource = storedMeta?.pdfUrl === doc.url;
      if (!forceRefresh && hasSummary('budget', doc.fiscalYear) && sameSource) {
        results.push({ fiscalYear: doc.fiscalYear, success: true, error: 'Already exists (skipped)', url: doc.url });
        continue;
      }

      // Fetch the PDF
      console.log(`Fetching budget PDF for ${doc.fiscalYear} (using ${model})...`);
      const pdfBase64 = await fetchPdfAsBase64(doc.url);

      if (!pdfBase64) {
        results.push({ fiscalYear: doc.fiscalYear, success: false, error: 'PDF not found', url: doc.url });
        continue;
      }

      // Analyze with AI
      console.log(`Analyzing budget for ${doc.fiscalYear} with ${model}...`);
      await analyzePdf(doc.fiscalYear, 'budget', pdfBase64, {
        forceRefresh: forceRefresh as boolean,
        model,
        metadata: { pdfUrl: doc.url, title: doc.title },
      });

      results.push({ fiscalYear: doc.fiscalYear, success: true, url: doc.url, model });
      console.log(`Generated summary for ${doc.fiscalYear}`);

    } catch (error) {
      results.push({
        fiscalYear: doc.fiscalYear,
        success: false,
        error: formatError(error),
        url: doc.url,
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    successful: results.filter(r => r.success && r.error !== 'Already exists (skipped)').length,
    skipped: results.filter(r => r.error === 'Already exists (skipped)').length,
    documentsFound: budgetDocuments.length,
    model,
    results,
  });
}

export async function handleGenerateAuditSummaries(params: HandlerParams) {
  // Generate AI summaries for Annual Financial Reports (audited financial statements)
  // These show what actually happened vs budgets which show what was planned
  const { forceRefresh = false, limit } = params || {};

  // Dynamically discover audit documents from city website
  console.log('Discovering audit documents from city website...');
  let auditDocuments = await getFinancialDocumentsByType('audit');
  console.log(`Found ${auditDocuments.length} audit documents`);

  // Apply limit if specified (useful for testing)
  if (limit && (limit as number) > 0) {
    auditDocuments = auditDocuments.slice(0, limit as number);
    console.log(`Limited to ${auditDocuments.length} documents for processing`);
  }

  if (auditDocuments.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'No audit documents found on city website',
    }, { status: 404 });
  }

  const results: { fiscalYear: string; success: boolean; error?: string; url?: string }[] = [];

  for (const doc of auditDocuments) {
    try {
      if (!forceRefresh && hasSummary('audit', doc.fiscalYear)) {
        results.push({ fiscalYear: doc.fiscalYear, success: true, error: 'Already exists (skipped)', url: doc.url });
        continue;
      }

      console.log(`Fetching audit PDF for ${doc.fiscalYear}...`);
      const pdfBase64 = await fetchPdfAsBase64(doc.url);

      if (!pdfBase64) {
        results.push({ fiscalYear: doc.fiscalYear, success: false, error: 'PDF not found', url: doc.url });
        continue;
      }

      console.log(`Analyzing audit for ${doc.fiscalYear}...`);
      await analyzePdf(doc.fiscalYear, 'audit', pdfBase64, {
        forceRefresh: forceRefresh as boolean,
        metadata: { pdfUrl: doc.url, title: doc.title },
      });

      results.push({ fiscalYear: doc.fiscalYear, success: true, url: doc.url });
      console.log(`Generated summary for ${doc.fiscalYear}`);

    } catch (error) {
      results.push({
        fiscalYear: doc.fiscalYear,
        success: false,
        error: formatError(error),
        url: doc.url,
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    successful: results.filter(r => r.success && r.error !== 'Already exists (skipped)').length,
    skipped: results.filter(r => r.error === 'Already exists (skipped)').length,
    documentsFound: auditDocuments.length,
    results,
  });
}

export async function handleGenerateBusinessSummaries(params: HandlerParams) {
  // Generate AI summaries for monthly business reports
  const { years = getRecentYears(2), months = getAllMonths(), forceRefresh = false } = params || {};

  const results: { month: string; success: boolean; error?: string }[] = [];

  for (const year of years as string[]) {
    for (const month of months as string[]) {
      const monthKey = `${year}-${month}`;

      try {
        if (!forceRefresh && hasSummary('business', monthKey)) {
          results.push({ month: monthKey, success: true, error: 'Already exists (skipped)' });
          continue;
        }

        const urls = getBusinessPdfUrl(year, month);
        const pdfResult = await fetchPdfWithFallback(urls);

        if (!pdfResult) {
          results.push({ month: monthKey, success: false, error: 'PDF not found' });
          continue;
        }

        const pdfBase64 = pdfResult.buffer.toString('base64');
        console.log(`Analyzing businesses for ${monthKey}...`);

        // Store the source URL so the /development link points at the exact
        // file the city published (same as the push path), rather than the
        // UI guessing a filename from the month
        await analyzePdf(monthKey, 'business', pdfBase64, {
          forceRefresh: forceRefresh as boolean,
          metadata: { pdfUrl: pdfResult.url },
        });

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

export async function handleImportBusinesses(params: HandlerParams) {
  // Businesses counterpart of import-permits' pdfsByMonth path, for the
  // same reason: the city's PDF CDN blocks the production IP, so the
  // PDFs are fetched on a local machine (scripts/push-businesses.sh)
  // and the OpenAI call happens here where the API key lives. Business
  // data is summaries-only — there are no rows to import.
  const pdfsByMonth = (params?.pdfsByMonth as Record<string, string> | undefined) || {};
  if (typeof pdfsByMonth !== 'object' || Array.isArray(pdfsByMonth)) {
    return NextResponse.json({ error: 'params.pdfsByMonth must be an object' }, { status: 400 });
  }

  // The city's PDF filenames are inconsistent (Jun2026 vs June2025,
  // April2025 vs Apr2025permit...), so the working URL — verified by the
  // local push before the PDF was fetched — is stored in the summary's
  // metadata. The /development source link then uses it instead of
  // guessing a filename from the month.
  const urlsByMonth = (params?.urlsByMonth as Record<string, string> | undefined) || {};
  if (typeof urlsByMonth !== 'object' || Array.isArray(urlsByMonth)) {
    return NextResponse.json({ error: 'params.urlsByMonth must be an object' }, { status: 400 });
  }

  const forceRefresh = params?.forceRefresh === true;

  const summaries: { month: string; success: boolean; action?: string; error?: string }[] = [];
  for (const [month, pdfBase64] of Object.entries(pdfsByMonth)) {
    if (!VALID_MONTH.test(month)) {
      summaries.push({ month, success: false, error: 'invalid month format (YYYY-MM)' });
      continue;
    }
    if (typeof pdfBase64 !== 'string' || !pdfBase64) {
      summaries.push({ month, success: false, error: 'pdfBase64 must be a non-empty string' });
      continue;
    }
    if (pdfBase64.length > MAX_PDF_BASE64_BYTES) {
      summaries.push({ month, success: false, error: `pdfBase64 too large (max ${MAX_PDF_BASE64_BYTES} chars)` });
      continue;
    }
    const pdfUrl = urlsByMonth[month];
    if (pdfUrl !== undefined && (typeof pdfUrl !== 'string' || !/^https?:\/\/.{1,500}$/.test(pdfUrl))) {
      summaries.push({ month, success: false, error: 'pdfUrl must be an http(s) URL under 500 chars' });
      continue;
    }
    try {
      // A re-push to backfill source URLs shouldn't pay for a new
      // summary: if the month is already summarized and we aren't
      // forcing, just refresh the stored URL.
      if (!forceRefresh && hasSummary('business', month)) {
        if (pdfUrl) updateSummaryMetadata('business', month, 'pdf-analysis', { pdfUrl });
        summaries.push({ month, success: true, action: 'url-updated' });
        continue;
      }
      await analyzePdf(month, 'business', pdfBase64, {
        forceRefresh: true,
        metadata: pdfUrl ? { pdfUrl } : undefined,
      });
      summaries.push({ month, success: true, action: 'summarized' });
    } catch (err) {
      summaries.push({ month, success: false, error: formatError(err) });
    }
  }

  return NextResponse.json({
    success: summaries.every(s => s.success),
    summaries,
  });
}
