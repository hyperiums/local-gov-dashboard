// Ordinance-related scrape handlers
import { NextResponse } from 'next/server';
import {
  scrapeMunicodeOrdinances,
  scrapeMunicodeSupplementHistory,
  getMunicodePdfUrl,
  linkOrdinancesToMeetings,
  updateOrdinanceDatesFromMeetings,
  inferReadingsFromDiscussed,
} from '@/lib/scraper';
import { fetchPdfAsBase64, analyzePdf } from '@/lib/summarize';
import {
  insertOrdinance,
  getOrdinances,
  getOrdinanceByNumber,
  updateOrdinanceSummary,
  getDb,
} from '@/lib/db';
import type { HandlerParams } from './shared';

export async function handleOrdinances(params: HandlerParams) {
  // Scrape ordinances from Municode
  // generateSummaries defaults to true so ordinances aren't left without context
  const { years, generateSummaries = true } = params || {};
  const ordinances = await scrapeMunicodeOrdinances(years as string[] | undefined);

  const results = [];
  for (const ord of ordinances) {
    let summary: string | undefined;

    // Generate AI summary by fetching and analyzing the PDF
    if (generateSummaries) {
      try {
        console.log(`Fetching PDF for ordinance ${ord.number}...`);
        const pdfBase64 = await fetchPdfAsBase64(ord.pdfUrl);

        if (pdfBase64) {
          console.log(`Analyzing PDF for ordinance ${ord.number}...`);
          summary = await analyzePdf(ord.number, 'ordinance', pdfBase64);
          console.log(`Generated summary for ordinance ${ord.number}`);
        } else {
          console.log(`Could not fetch PDF for ordinance ${ord.number}`);
        }
      } catch (error) {
        console.error(`Failed to generate summary for ordinance ${ord.number}:`, error);
      }
    }

    insertOrdinance({
      id: `municode-ord-${ord.number}`,
      number: ord.number,
      title: ord.title,
      status: 'adopted',
      adoptedDate: `${ord.year}-01-01`, // We don't have exact dates from the list
      municodeUrl: ord.municodeUrl,
      summary,
    });

    results.push({ ...ord, summary: summary ? 'generated' : 'none' });
  }

  return NextResponse.json({
    success: true,
    ordinanceCount: ordinances.length,
    ordinances: results,
    summariesGenerated: generateSummaries,
  });
}

export async function handleSyncMunicodeSupplements() {
  // Scrape Municode Supplement History table to get authoritative adoption status
  // This fixes data quality issues where old ordinances appear as "pending"
  // The supplement table shows all ordinances with disposition: Include (codified) or Omit (not codified)
  console.log('Scraping Municode Supplement History...');
  const supplementEntries = await scrapeMunicodeSupplementHistory();

  const results: {
    number: string;
    action: 'created' | 'updated' | 'skipped';
    disposition: string;
    error?: string;
  }[] = [];

  const db = getDb();

  for (const entry of supplementEntries) {
    try {
      // Check if ordinance already exists
      const existing = getOrdinanceByNumber(entry.ordinanceNumber);

      if (existing) {
        // Update existing ordinance with supplement data
        // Only update if it doesn't already have adopted status or missing disposition
        if (existing.status !== 'adopted' || !existing.disposition) {
          db.prepare(`
            UPDATE ordinances
            SET status = 'adopted',
                disposition = ?,
                adopted_date = COALESCE(adopted_date, ?)
            WHERE number = ?
          `).run(entry.disposition, entry.adoptedDate, entry.ordinanceNumber);

          results.push({
            number: entry.ordinanceNumber,
            action: 'updated',
            disposition: entry.disposition,
          });
          console.log(`  Updated ordinance ${entry.ordinanceNumber} → adopted (${entry.disposition})`);
        } else {
          results.push({
            number: entry.ordinanceNumber,
            action: 'skipped',
            disposition: entry.disposition,
          });
        }
      } else {
        // Create new ordinance record from supplement history
        // For codified ordinances, we can construct the Municode URL
        // For omitted ordinances, there's no Municode page
        const id = `supplement-ord-${entry.ordinanceNumber}`;
        const title = `Ordinance No. ${entry.ordinanceNumber}`;

        // Note: We don't have the Municode URL from supplement history
        // Those would need to be fetched separately via the ordinances scrape

        insertOrdinance({
          id,
          number: entry.ordinanceNumber,
          title,
          status: 'adopted',
          adoptedDate: entry.adoptedDate,
          disposition: entry.disposition,
        });

        results.push({
          number: entry.ordinanceNumber,
          action: 'created',
          disposition: entry.disposition,
        });
        console.log(`  Created ordinance ${entry.ordinanceNumber} (${entry.disposition})`);
      }
    } catch (error) {
      console.error(`  Error processing ordinance ${entry.ordinanceNumber}:`, error);
      results.push({
        number: entry.ordinanceNumber,
        action: 'skipped',
        disposition: entry.disposition,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const created = results.filter(r => r.action === 'created').length;
  const updated = results.filter(r => r.action === 'updated').length;
  const skipped = results.filter(r => r.action === 'skipped').length;
  const codified = results.filter(r => r.disposition === 'codified').length;
  const omitted = results.filter(r => r.disposition === 'omit').length;

  console.log(`Sync complete: ${created} created, ${updated} updated, ${skipped} skipped`);
  console.log(`Disposition breakdown: ${codified} codified, ${omitted} omitted`);

  return NextResponse.json({
    success: true,
    totalEntriesFound: supplementEntries.length,
    created,
    updated,
    skipped,
    codified,
    omitted,
    results,
  });
}

export async function handleLinkOrdinances(params: HandlerParams) {
  const { ordinanceNumber } = params || {};

  // Link ordinances to meetings based on agenda item references
  console.log('Starting ordinance-meeting linking...');
  const result = linkOrdinancesToMeetings();

  // Infer readings from "discussed" actions based on chronological order
  // Pass ordinanceNumber to test on a single ordinance before running on all
  console.log(ordinanceNumber
    ? `Inferring readings for ordinance ${ordinanceNumber}...`
    : 'Inferring readings from chronological sequence...');
  const inferred = inferReadingsFromDiscussed(ordinanceNumber as string | undefined);

  // Update ordinance adoption dates from linked meeting dates
  const datesUpdated = updateOrdinanceDatesFromMeetings();

  return NextResponse.json({
    success: true,
    linked: result.linked,
    readingsInferred: inferred.updated,
    ordinancesInferred: inferred.ordinances,
    datesUpdated,
    notFound: result.notFound,
    errors: result.errors,
  });
}

type ModelOption = 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4-turbo';

export async function handleGenerateOrdinanceSummaries(params: HandlerParams) {
  // Generate AI summaries for existing ordinances without summaries
  const { limit = 10, forceRefresh = false, model: modelParam = 'gpt-4o-mini' } = params || {};
  const model = modelParam as ModelOption;

  // Get ordinances from database
  const ordinances = getOrdinances({ limit: 200 }) as {
    id: string;
    number: string;
    title: string;
    summary: string | null;
    municode_url: string | null;
  }[];

  // Filter to those without summaries (unless forceRefresh)
  const toProcess = forceRefresh
    ? ordinances.slice(0, limit as number)
    : ordinances.filter(o => !o.summary).slice(0, limit as number);

  const results = [];
  for (const ord of toProcess) {
    try {
      // Get nodeId from municode_url or construct from number
      const nodeIdMatch = ord.municode_url?.match(/nodeId=(\d+)/);
      if (!nodeIdMatch) {
        results.push({ number: ord.number, success: false, error: 'No nodeId in URL' });
        continue;
      }

      const pdfUrl = getMunicodePdfUrl(nodeIdMatch[1]);
      console.log(`Fetching PDF for ordinance ${ord.number} (using ${model})...`);
      const pdfBase64 = await fetchPdfAsBase64(pdfUrl);

      if (pdfBase64) {
        console.log(`Analyzing PDF for ordinance ${ord.number} with ${model}...`);
        const summary = await analyzePdf(ord.number, 'ordinance', pdfBase64, { forceRefresh: forceRefresh as boolean, model });

        // Update the ordinance in the database
        updateOrdinanceSummary(ord.id, summary);
        results.push({ number: ord.number, success: true, summaryLength: summary.length, model });
        console.log(`Generated summary for ordinance ${ord.number}`);
      } else {
        results.push({ number: ord.number, success: false, error: 'Could not fetch PDF' });
      }
    } catch (error) {
      console.error(`Failed to generate summary for ordinance ${ord.number}:`, error);
      results.push({
        number: ord.number,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    successful: results.filter(r => r.success).length,
    model,
    results,
  });
}
