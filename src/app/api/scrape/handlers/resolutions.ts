// Resolution-related scrape handlers
import { NextResponse } from 'next/server';
import {
  extractResolutionsFromAgendaItems,
  fetchCivicClerkResolutionAttachments,
  fetchCivicClerkAgendaPdf,
  fetchCivicClerkMinutesPdf,
  fetchVoteOutcomesFromOverview,
} from '@/lib/scraper';
import {
  analyzePdf,
  extractResolutionFromAgendaPdf,
  generateResolutionSummaryFromText,
  extractOutcomesFromMinutesPdf,
} from '@/lib/summarize';
import {
  getResolutions,
  updateResolutionSummary,
  updateResolutionOutcome,
  getDb,
} from '@/lib/db';
import { cityName } from '@/lib/city-config-client';
import { formatError, extractEventId, type HandlerParams } from './shared';

export async function handleExtractResolutions() {
  // Extract resolutions from agenda items and store in resolutions table
  console.log('Extracting resolutions from agenda items...');
  const count = extractResolutionsFromAgendaItems();

  return NextResponse.json({
    success: true,
    resolutionsExtracted: count,
  });
}

export async function handleBackfillResolutionOutcomes(params: HandlerParams) {
  // Backfill resolution outcomes from the CivicClerk overview page
  // This extracts actual voting results from the structured vote data
  const { limit = 50 } = params || {};
  console.log('Backfilling resolution outcomes from overview page...');

  const db = getDb();

  // Get all meetings that have resolutions needing verification
  const meetingsWithResolutions = db.prepare(`
    SELECT DISTINCT m.id, m.date
    FROM meetings m
    JOIN resolutions r ON r.meeting_id = m.id
    WHERE r.outcome_verified = 0
      AND m.date < date('now')
    ORDER BY m.date DESC
    LIMIT ?
  `).all(limit as number) as { id: string; date: string }[];

  console.log(`Found ${meetingsWithResolutions.length} meetings with unverified resolutions`);

  const results: {
    meetingId: string;
    date: string;
    success: boolean;
    hasVoteData?: boolean;
    outcomesExtracted?: number;
    resolutionsUpdated?: string[];
    error?: string;
  }[] = [];

  for (const meeting of meetingsWithResolutions) {
    try {
      // Extract event ID from meeting ID
      const eventId = extractEventId(meeting.id);
      if (!eventId) {
        results.push({ meetingId: meeting.id, date: meeting.date, success: false, error: 'Invalid meeting ID format' });
        continue;
      }

      // Get resolutions for this meeting
      const resolutions = db.prepare(`
        SELECT id, number, title
        FROM resolutions
        WHERE meeting_id = ? AND outcome_verified = 0
      `).all(meeting.id) as { id: string; number: string; title: string }[];

      if (resolutions.length === 0) {
        results.push({ meetingId: meeting.id, date: meeting.date, success: true, outcomesExtracted: 0 });
        continue;
      }

      console.log(`Processing ${resolutions.length} resolutions from meeting ${meeting.id} (event ${eventId})...`);

      // Fetch vote outcomes from overview page
      const voteOutcomes = await fetchVoteOutcomesFromOverview(eventId);

      if (voteOutcomes.length === 0) {
        // No vote data on overview page - try PDF fallback
        console.log(`  No overview vote data, trying PDF fallback...`);

        const minutesPdf = await fetchCivicClerkMinutesPdf(eventId);
        if (!minutesPdf) {
          // No minutes PDF available either
          console.log(`  No minutes PDF available for event ${eventId}`);
          results.push({
            meetingId: meeting.id,
            date: meeting.date,
            success: true,
            hasVoteData: false,
            outcomesExtracted: 0,
            resolutionsUpdated: [],
          });
          continue;
        }

        console.log(`  Found minutes PDF, extracting via GPT-4o...`);

        // Get agenda items for matching
        const agendaItems = db.prepare(`
          SELECT reference_number as reference, title
          FROM agenda_items WHERE meeting_id = ?
        `).all(meeting.id) as { reference: string; title: string }[];

        // Extract outcomes from PDF via AI
        const pdfOutcomes = await extractOutcomesFromMinutesPdf(minutesPdf, agendaItems);
        console.log(`  Extracted ${pdfOutcomes.length} outcomes from PDF`);

        if (pdfOutcomes.length === 0) {
          results.push({
            meetingId: meeting.id,
            date: meeting.date,
            success: true,
            hasVoteData: false,
            outcomesExtracted: 0,
            resolutionsUpdated: [],
          });
          continue;
        }

        // Update resolutions with PDF-extracted outcomes
        const updatedResolutions: string[] = [];
        for (const resolution of resolutions) {
          // Match by resolution number
          const matchingOutcome = pdfOutcomes.find(o =>
            o.reference === resolution.number ||
            o.reference === `Resolution ${resolution.number}` ||
            o.title?.toLowerCase().includes(resolution.number.toLowerCase())
          );

          if (matchingOutcome) {
            const status = matchingOutcome.outcome;
            updateResolutionOutcome(
              resolution.id,
              status,
              status === 'adopted' ? meeting.date : undefined
            );

            const voteInfo = matchingOutcome.voteDetails
              ? `${matchingOutcome.voteDetails.ayes?.length || '?'}-${matchingOutcome.voteDetails.nays?.length || 0}`
              : 'from PDF';
            updatedResolutions.push(`${resolution.number}: ${status} (${voteInfo})`);
            console.log(`  Updated ${resolution.number} → ${status} (from PDF)`);
          }
        }

        results.push({
          meetingId: meeting.id,
          date: meeting.date,
          success: true,
          hasVoteData: true,
          outcomesExtracted: pdfOutcomes.length,
          resolutionsUpdated: updatedResolutions,
        });
        continue;
      }

      console.log(`Found ${voteOutcomes.length} vote outcomes from overview page`);

      // Update resolutions with extracted outcomes
      const updatedResolutions: string[] = [];
      for (const resolution of resolutions) {
        // Find matching vote outcome by resolution number in item title
        const matchingVote = voteOutcomes.find(v =>
          v.itemTitle.toLowerCase().includes(`resolution ${resolution.number}`.toLowerCase()) ||
          v.itemTitle.toLowerCase().includes(`resolution no. ${resolution.number}`.toLowerCase()) ||
          v.itemTitle.includes(resolution.number)
        );

        if (matchingVote) {
          // Determine status based on both motion type and result
          // If motion was to table and it passed, the resolution is tabled
          // If motion was to deny and it passed, the resolution is rejected
          let status: 'adopted' | 'rejected' | 'tabled';
          if (matchingVote.motion?.toLowerCase() === 'table' && matchingVote.result === 'passed') {
            status = 'tabled';
          } else if (matchingVote.motion?.toLowerCase() === 'deny' && matchingVote.result === 'passed') {
            status = 'rejected';
          } else if (matchingVote.result === 'passed') {
            status = 'adopted';
          } else if (matchingVote.result === 'failed') {
            status = 'rejected';
          } else if (matchingVote.result === 'tabled') {
            status = 'tabled';
          } else {
            status = 'adopted'; // fallback
          }

          updateResolutionOutcome(
            resolution.id,
            status,
            status === 'adopted' ? meeting.date : undefined
          );
          updatedResolutions.push(`${resolution.number}: ${status} (${matchingVote.yesCount}-${matchingVote.noCount})`);
          console.log(`  Updated ${resolution.number} → ${status} (Yes: ${matchingVote.yesCount}, No: ${matchingVote.noCount})`);
        }
      }

      results.push({
        meetingId: meeting.id,
        date: meeting.date,
        success: true,
        hasVoteData: true,
        outcomesExtracted: voteOutcomes.length,
        resolutionsUpdated: updatedResolutions,
      });

    } catch (error) {
      console.error(`Error processing meeting ${meeting.id}:`, error);
      results.push({
        meetingId: meeting.id,
        date: meeting.date,
        success: false,
        error: formatError(error),
      });
    }
  }

  const totalUpdated = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + (r.resolutionsUpdated?.length || 0), 0);

  return NextResponse.json({
    success: true,
    meetingsProcessed: results.length,
    resolutionsUpdated: totalUpdated,
    results,
  });
}

export async function handleGenerateResolutionSummaries(params: HandlerParams) {
  // Generate AI summaries for resolutions by fetching individual resolution PDFs
  const { limit = 10, forceRefresh = false } = params || {};

  // Get resolutions from database
  const resolutions = getResolutions({ limit: 100 }) as {
    id: string;
    number: string;
    title: string;
    status: string;
    summary: string | null;
    meeting_id: string | null;
  }[];

  // Filter to those without summaries (unless forceRefresh)
  const toProcess = forceRefresh
    ? resolutions.slice(0, limit as number)
    : resolutions.filter(r => !r.summary).slice(0, limit as number);

  const results = [];
  for (const res of toProcess) {
    try {
      // Need meeting ID to get the resolution attachments
      if (!res.meeting_id) {
        results.push({ number: res.number, success: false, error: 'No meeting_id' });
        continue;
      }

      // Extract event ID from meeting ID (format: civicclerk-XX)
      const eventId = extractEventId(res.meeting_id);
      if (!eventId) {
        results.push({ number: res.number, success: false, error: 'Invalid meeting ID format' });
        continue;
      }
      console.log(`Fetching resolution ${res.number} attachments from event ${eventId}...`);

      // Fetch the actual resolution PDF and staff recommendations
      const attachments = await fetchCivicClerkResolutionAttachments(eventId, res.number);

      let summary: string | null = null;
      let summarySource: 'separate_pdf' | 'agenda_pdf' | null = null;

      if (attachments.resolution) {
        // NEW meetings: Use separate resolution PDF
        console.log(`Analyzing resolution ${res.number} from separate PDF...`);

        const hasStaffReport = !!attachments.staffReport;
        const isProposed = res.status === 'proposed';
        const proposedNote = isProposed
          ? `\nNote: This is a draft document. Signature lines are templates, not endorsements.\nDescribe what this resolution would do IF adopted. Do not attribute positions to officials.\n`
          : '';

        const customPrompt = `You are analyzing resolution documents from ${cityName} City Council.

Resolution ${res.number}: "${res.title}"
Status: ${res.status.toUpperCase()}${isProposed ? ' (not yet voted on)' : ''}
${proposedNote}
You have access to:
1. The official resolution document (contains WHEREAS clauses and the resolution text)${hasStaffReport ? '\n2. Staff recommendations (explains context and reasoning)' : ''}

Extract and summarize:
1. **What it does** - Explain in plain language what this resolution ${isProposed ? 'would accomplish if adopted' : 'accomplishes'}
2. **Key details** - Any important specifics (amounts, locations, parties involved, street names)
3. **Background** - Why this resolution was ${isProposed ? 'proposed' : 'needed'} (from WHEREAS clauses or staff report)
4. **Impact** - How this ${isProposed ? 'would affect' : 'affects'} residents or the community

Keep the summary concise (2-3 paragraphs). Use plain language that a resident would understand.`;

        summary = await analyzePdf(
          `resolution-${res.number}`,
          'resolution',
          attachments.resolution,
          {
            forceRefresh: forceRefresh as boolean,
            customPrompt,
          }
        );
        summarySource = 'separate_pdf';
      } else {
        // OLDER meetings fallback: Extract from agenda PDF
        console.log(`Resolution ${res.number}: No separate PDF, trying agenda PDF fallback...`);

        try {
          const agendaPdf = await fetchCivicClerkAgendaPdf(eventId);
          if (agendaPdf) {
            // Step 1: Extract exact resolution text from agenda PDF
            console.log(`Extracting resolution ${res.number} text from agenda PDF...`);
            const extracted = await extractResolutionFromAgendaPdf(agendaPdf, res.number);

            if (extracted.found && extracted.rawText) {
              // Step 2: Generate summary from extracted text
              console.log(`Generating summary for resolution ${res.number} from extracted text...`);
              summary = await generateResolutionSummaryFromText(
                res.number,
                res.title,
                extracted.rawText,
                res.status as 'proposed' | 'adopted' | 'rejected' | 'tabled'
              );
              summarySource = 'agenda_pdf';
            } else {
              console.log(`Resolution ${res.number}: Not found in agenda PDF`);
            }
          }
        } catch (fallbackError) {
          console.error(`Resolution ${res.number}: Agenda PDF fallback failed:`, fallbackError);
        }
      }

      if (!summary) {
        results.push({ number: res.number, success: false, error: 'Resolution text not found in separate PDF or agenda' });
        continue;
      }

      // Update the resolution in the database
      updateResolutionSummary(res.id, summary);
      results.push({
        number: res.number,
        success: true,
        summaryLength: summary.length,
        source: summarySource,
      });
      console.log(`Generated summary for resolution ${res.number} (source: ${summarySource})`);

    } catch (error) {
      console.error(`Failed to generate summary for resolution ${res.number}:`, error);
      results.push({
        number: res.number,
        success: false,
        error: formatError(error),
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    successful: results.filter(r => r.success).length,
    results,
  });
}
