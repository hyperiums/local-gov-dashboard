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
import { formatError, hasSummary, type HandlerParams } from './shared';

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
      // Check if we already have a summary
      if (!forceRefresh && hasSummary('budget', doc.fiscalYear)) {
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

        await analyzePdf(monthKey, 'business', pdfBase64, { forceRefresh: forceRefresh as boolean });

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
