// Civic document scrape handlers (SPLOST, notices, strategic plans, water quality)
import { NextResponse } from 'next/server';
import {
  getCivicDocumentsByType,
  type CivicDocType,
} from '@/lib/scraper';
import {
  fetchPdfAsBase64,
  analyzePdf,
  generateAllSummaryLevels,
} from '@/lib/summarize';
import { updateSummaryMetadata } from '@/lib/db';
import { formatError, hasSummary, type HandlerParams } from './shared';

export async function handleGenerateCivicSummaries(params: HandlerParams) {
  // Generate AI summaries for civic documents (SPLOST, Public Notices, Strategic Plans, Water Quality)
  // Dynamically discovers documents from city website pages
  const { docType, forceRefresh = false, limit } = params || {};

  if (!docType || !['splost', 'notice', 'strategic', 'water-quality'].includes(docType as string)) {
    return NextResponse.json({
      error: 'docType is required and must be one of: splost, notice, strategic, water-quality',
    }, { status: 400 });
  }

  const civicDocType = docType as CivicDocType;
  console.log(`Discovering ${civicDocType} documents from city website...`);
  let documents = await getCivicDocumentsByType(civicDocType);
  console.log(`Found ${documents.length} ${civicDocType} documents`);

  if (documents.length === 0) {
    return NextResponse.json({
      success: false,
      error: `No ${civicDocType} documents found on city website`,
    }, { status: 404 });
  }

  // Apply limit if specified (useful for testing)
  if (limit && (limit as number) > 0) {
    documents = documents.slice(0, limit as number);
    console.log(`Limited to ${documents.length} documents for processing`);
  }

  const results: { id: string; title: string; success: boolean; error?: string; url?: string }[] = [];

  for (const doc of documents) {
    try {
      // Check if we already have a summary
      if (!forceRefresh && hasSummary(civicDocType, doc.id)) {
        results.push({ id: doc.id, title: doc.title, success: true, error: 'Already exists (skipped)', url: doc.url });
        continue;
      }

      console.log(`Fetching PDF: ${doc.url}`);
      const pdfBase64 = await fetchPdfAsBase64(doc.url);

      if (!pdfBase64) {
        results.push({ id: doc.id, title: doc.title, success: false, error: 'Failed to fetch PDF', url: doc.url });
        continue;
      }

      // Analyze with AI
      console.log(`Analyzing ${civicDocType} document: ${doc.title}...`);
      const detailedSummary = await analyzePdf(doc.id, civicDocType, pdfBase64, {
        forceRefresh: forceRefresh as boolean,
        metadata: { pdfUrl: doc.url, title: doc.title, date: doc.date },
      });

      // Generate multi-level summaries (headline, brief, detailed)
      console.log(`Generating multi-level summaries for ${doc.id}...`);
      await generateAllSummaryLevels(civicDocType, doc.id, detailedSummary);

      // Extract title from AI response if present and update metadata
      const titleMatch = detailedSummary.match(/\*\*Title:\*\*\s*(.+?)(?:\n|$)/);
      const extractedTitle = titleMatch ? titleMatch[1].trim() : doc.title;

      // Extract document date - try filename FIRST (more reliable for SPLOST etc), then AI response
      let extractedDate = doc.date;

      // First try filename patterns - these are most reliable
      // Pattern: "12-31-22" or "12-31-2022" (MM-DD-YY or MM-DD-YYYY) - common in SPLOST filenames
      const datePattern = /(\d{1,2})-(\d{1,2})-(\d{2,4})/;
      const filenameMatch = doc.id.match(datePattern);
      if (filenameMatch) {
        const [, month, day, year] = filenameMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        extractedDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }

      // If no date from filename, try AI response
      if (!extractedDate) {
        const dateMatch = detailedSummary.match(/\*\*Document Date:\*\*\s*(.+?)(?:\n|$)/);
        if (dateMatch) {
          const dateStr = dateMatch[1].trim();
          // Try to parse various date formats into YYYY-MM-DD
          if (dateStr && dateStr.toLowerCase() !== 'not specified') {
            // Check if already in YYYY-MM-DD format
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              extractedDate = dateStr;
            } else {
              // Try to parse other formats (but not just years like "2023")
              if (!/^\d{4}$/.test(dateStr) && !/^FY\d{4}$/i.test(dateStr)) {
                const parsed = new Date(dateStr);
                if (!isNaN(parsed.getTime())) {
                  extractedDate = parsed.toISOString().split('T')[0];
                }
              }
            }
          }
        }
      }

      // Last resort: year only from filename like "2024-CCR" or "fy2025" or "2024"
      if (!extractedDate) {
        const yearPattern = /(?:^|[^\d])(\d{4})(?:[^\d]|$)|fy(\d{4})/i;
        const yearMatch = doc.id.match(yearPattern);
        if (yearMatch) {
          extractedDate = `${yearMatch[1] || yearMatch[2]}-01-01`;
        }
      }

      // Update metadata with extracted title and date
      const metadataUpdates: Record<string, string> = {};
      if (titleMatch) metadataUpdates.title = extractedTitle;
      if (extractedDate && extractedDate !== doc.date) metadataUpdates.date = extractedDate;

      if (Object.keys(metadataUpdates).length > 0) {
        updateSummaryMetadata(civicDocType, doc.id, 'pdf-analysis', metadataUpdates);
      }

      results.push({ id: doc.id, title: extractedTitle, success: true, url: doc.url });
      console.log(`Generated summary for ${extractedTitle}`);

    } catch (error) {
      results.push({
        id: doc.id,
        title: doc.title,
        success: false,
        error: formatError(error),
        url: doc.url,
      });
    }
  }

  return NextResponse.json({
    success: true,
    docType: civicDocType,
    processed: results.length,
    successful: results.filter(r => r.success && r.error !== 'Already exists (skipped)').length,
    skipped: results.filter(r => r.error === 'Already exists (skipped)').length,
    documentsFound: documents.length,
    results,
  });
}
