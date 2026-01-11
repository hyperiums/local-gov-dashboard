import { NextResponse } from 'next/server';
import { extractText } from 'unpdf';
import {
  scrapeCivicClerkMeetingDetails,
  scrapeCivicClerkMeetingsWithPlaywright,
  getPermitPdfUrl,
  getBusinessPdfUrl,
  fetchPdfWithFallback,
  parsePermitPdfText,
  scrapeFinancialReports,
  getFinancialDocumentsByType,
  getCivicDocumentsByType,
  scrapeMunicodeOrdinances,
  discoverCivicClerkEventIds,
  getMunicodePdfUrl,
  fetchCivicClerkAgendaPdf,
  fetchCivicClerkMinutesPdf,
  fetchCivicClerkResolutionAttachments,
  createOrdinanceFromAgendaItem,
  linkOrdinancesToMeetings,
  updateOrdinanceDatesFromMeetings,
  extractResolutionsFromAgendaItems,
  type CivicDocType,
} from '@/lib/scraper';
import { fetchPdfAsBase64, analyzePdf, generateAllSummaryLevels, extractResolutionFromAgendaPdf, generateResolutionSummaryFromText } from '@/lib/summarize';
import { getRecentYears, getAllMonths } from '@/lib/dates';
import {
  insertMeeting,
  insertAgendaItem,
  insertPermit,
  insertOrdinance,
  getOrdinances,
  getOrdinanceByNumber,
  getResolutions,
  getMeetingById,
  updateOrdinanceSummary,
  updateResolutionSummary,
  updateMeetingSummary,
  updateMeetingAgendaSummary,
  updateMeetingMinutesSummary,
  updateSummaryMetadata,
  getDb,
  type MeetingRow,
} from '@/lib/db';

async function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  try {
    const uint8Array = new Uint8Array(buffer);
    const result = await extractText(uint8Array);
    // extractText returns { text: string[] } - join pages together
    const text = Array.isArray(result.text) ? result.text.join('\n') : result.text;
    return { text };
  } catch (error) {
    console.error('PDF parsing error:', error);
    return { text: '' };
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/scrape - Trigger data scraping
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, params } = body;

    // Ensure database is initialized
    getDb();

    switch (type) {
      case 'meeting': {
        // Scrape a specific CivicClerk meeting
        // fullRefresh: also generate agenda summary and extract resolutions
        const eventId = params?.eventId;
        const fullRefresh = params?.fullRefresh ?? false;

        if (!eventId) {
          return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
        }

        const { meeting, agendaItems } = await scrapeCivicClerkMeetingDetails(eventId);

        if (meeting) {
          insertMeeting({
            id: meeting.id,
            date: meeting.date,
            title: meeting.title,
            type: meeting.type,
            location: meeting.location,
            agendaUrl: meeting.agendaUrl,
            packetUrl: meeting.packetUrl,
            status: new Date(meeting.date) > new Date() ? 'upcoming' : 'past',
          });

          for (const item of agendaItems) {
            insertAgendaItem({
              id: `${meeting.id}-item-${item.orderNum}`,
              meetingId: meeting.id,
              orderNum: item.orderNum,
              title: item.title,
              type: item.type,
              referenceNumber: item.referenceNumber,
            });
          }

          // Auto-create ordinances that are referenced in agenda items but don't exist yet
          // This ensures ordinances are tracked even before they appear in Municode
          let ordinancesCreated = 0;
          for (const item of agendaItems) {
            // Check if this item references an ordinance (either type='ordinance' or public_hearing with ref number)
            if (item.referenceNumber && (
              item.type === 'ordinance' ||
              (item.type === 'public_hearing' && item.title.toLowerCase().includes('ordinance'))
            )) {
              const existing = getOrdinanceByNumber(item.referenceNumber);
              if (!existing) {
                createOrdinanceFromAgendaItem(
                  item.referenceNumber,
                  item.title,
                  meeting.date,
                  meeting.id
                );
                ordinancesCreated++;
              }
            }
          }

          // Link ordinances to this meeting
          if (ordinancesCreated > 0 || agendaItems.some(i => i.type === 'ordinance' || i.title.toLowerCase().includes('ordinance'))) {
            linkOrdinancesToMeetings();
          }

          const result: {
            success: boolean;
            meeting: typeof meeting;
            agendaItemCount: number;
            ordinancesCreated?: number;
            agendaSummary?: string;
            resolutionsExtracted?: number;
            resolutionSummaries?: { attempted: number; succeeded: number };
          } = {
            success: true,
            meeting,
            agendaItemCount: agendaItems.length,
            ordinancesCreated: ordinancesCreated > 0 ? ordinancesCreated : undefined,
          };

          // If fullRefresh, also generate agenda summary and extract resolutions
          if (fullRefresh) {
            // Generate agenda summary
            try {
              console.log(`Fetching agenda PDF for meeting ${meeting.id}...`);
              const pdfBase64 = await fetchCivicClerkAgendaPdf(eventId);

              if (pdfBase64) {
                console.log(`Analyzing agenda for meeting ${meeting.id}...`);
                const summary = await analyzePdf(`${meeting.id}-agenda`, 'agenda', pdfBase64, { forceRefresh: true });
                updateMeetingAgendaSummary(meeting.id, summary);
                result.agendaSummary = 'generated';
                console.log(`Generated agenda summary for meeting ${meeting.id}`);
              } else {
                result.agendaSummary = 'no_pdf';
              }
            } catch (error) {
              console.error(`Failed to generate agenda summary:`, error);
              result.agendaSummary = 'error';
            }

            // Extract resolutions from this meeting's agenda items
            try {
              console.log(`Extracting resolutions from meeting ${meeting.id}...`);
              const count = extractResolutionsFromAgendaItems(meeting.id);
              result.resolutionsExtracted = count;
              console.log(`Extracted ${count} resolutions from meeting ${meeting.id}`);

              // Generate summaries for newly extracted resolutions
              if (count > 0) {
                console.log(`Generating summaries for ${count} resolutions...`);
                const resolutions = getResolutions({ limit: 100 }) as {
                  id: string;
                  number: string;
                  title: string;
                  status: string;
                  summary: string | null;
                  meeting_id: string | null;
                }[];

                // Filter to resolutions from this meeting without summaries
                const toSummarize = resolutions.filter(r =>
                  r.meeting_id === meeting.id && !r.summary
                );

                result.resolutionSummaries = { attempted: toSummarize.length, succeeded: 0 };

                for (const res of toSummarize) {
                  try {
                    console.log(`Fetching resolution ${res.number} attachments...`);
                    const attachments = await fetchCivicClerkResolutionAttachments(eventId, res.number);

                    if (!attachments.resolution) {
                      console.log(`Resolution ${res.number}: no PDF found`);
                      continue;
                    }

                    const hasStaffReport = !!attachments.staffReport;
                    const isProposed = res.status === 'proposed';
                    const proposedNote = isProposed
                      ? `\nNote: This is a draft document. Signature lines are templates, not endorsements.\nDescribe what this resolution would do IF adopted. Do not attribute positions to officials.\n`
                      : '';

                    const customPrompt = `You are analyzing resolution documents from Flowery Branch City Council.

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

                    console.log(`Analyzing resolution ${res.number}...`);
                    const summary = await analyzePdf(
                      `resolution-${res.number}`,
                      'resolution',
                      attachments.resolution,
                      { forceRefresh: true, customPrompt }
                    );

                    updateResolutionSummary(res.id, summary);
                    result.resolutionSummaries.succeeded++;
                    console.log(`Generated summary for resolution ${res.number}`);
                  } catch (error) {
                    console.error(`Failed to summarize resolution ${res.number}:`, error);
                  }
                }
              }
            } catch (error) {
              console.error(`Failed to extract resolutions:`, error);
            }
          }

          return NextResponse.json(result);
        }

        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
      }

      case 'permits': {
        // Scrape permit PDFs for a given month
        const { year, month } = params || {};
        if (!year || !month) {
          return NextResponse.json({ error: 'year and month are required' }, { status: 400 });
        }

        const urls = getPermitPdfUrl(year, month);
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

      case 'financial': {
        // Scrape financial report links
        const reports = await scrapeFinancialReports();

        return NextResponse.json({
          success: true,
          reportCount: reports.length,
          reports,
        });
      }

      case 'ordinances': {
        // Scrape ordinances from Municode
        // generateSummaries defaults to true so ordinances aren't left without context
        const { years, generateSummaries = true } = params || {};
        const ordinances = await scrapeMunicodeOrdinances(years);

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

      case 'link-ordinances': {
        // Link ordinances to meetings based on agenda item references
        console.log('Starting ordinance-meeting linking...');
        const result = linkOrdinancesToMeetings();

        // Update ordinance adoption dates from linked meeting dates
        const datesUpdated = updateOrdinanceDatesFromMeetings();

        return NextResponse.json({
          success: true,
          linked: result.linked,
          datesUpdated,
          notFound: result.notFound,
          errors: result.errors,
        });
      }

      case 'extract-resolutions': {
        // Extract resolutions from agenda items and store in resolutions table
        console.log('Extracting resolutions from agenda items...');
        const count = extractResolutionsFromAgendaItems();

        return NextResponse.json({
          success: true,
          resolutionsExtracted: count,
        });
      }

      case 'generate-resolution-summaries': {
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
          ? resolutions.slice(0, limit)
          : resolutions.filter(r => !r.summary).slice(0, limit);

        const results = [];
        for (const res of toProcess) {
          try {
            // Need meeting ID to get the resolution attachments
            if (!res.meeting_id) {
              results.push({ number: res.number, success: false, error: 'No meeting_id' });
              continue;
            }

            // Extract event ID from meeting ID (format: civicclerk-XX)
            const eventIdMatch = res.meeting_id.match(/civicclerk-(\d+)/);
            if (!eventIdMatch) {
              results.push({ number: res.number, success: false, error: 'Invalid meeting ID format' });
              continue;
            }

            const eventId = parseInt(eventIdMatch[1]);
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

              const customPrompt = `You are analyzing resolution documents from Flowery Branch City Council.

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
                  forceRefresh,
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
              error: error instanceof Error ? error.message : 'Unknown error',
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

      case 'reset-database': {
        // Clear all data from all tables while preserving schema
        console.log('Resetting database - clearing all data...');
        const db = getDb();

        // Delete in order to respect foreign key constraints
        const tables = [
          'ordinance_meetings',
          'agenda_items',
          'attachments',
          'meetings',
          'ordinances',
          'resolutions',
          'permits',
          'summaries',
        ];

        const counts: Record<string, number> = {};
        for (const table of tables) {
          const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
          counts[table] = countResult.count;
          db.prepare(`DELETE FROM ${table}`).run();
          console.log(`  Cleared ${counts[table]} rows from ${table}`);
        }

        return NextResponse.json({
          success: true,
          message: 'All data cleared from database',
          deletedCounts: counts,
        });
      }

      case 'generate-ordinance-summaries': {
        // Generate AI summaries for existing ordinances without summaries
        const { limit = 10, forceRefresh = false, model = 'gpt-4o-mini' } = params || {};

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
          ? ordinances.slice(0, limit)
          : ordinances.filter(o => !o.summary).slice(0, limit);

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
              const summary = await analyzePdf(ord.number, 'ordinance', pdfBase64, { forceRefresh, model });

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

      case 'discover-meetings': {
        // Discover valid CivicClerk event IDs using Playwright
        const validIds = await discoverCivicClerkEventIds();

        return NextResponse.json({
          success: true,
          validIds,
          count: validIds.length,
        });
      }

      case 'bulk-meetings': {
        // Scrape all meetings directly from CivicClerk portal using Playwright
        const meetings = await scrapeCivicClerkMeetingsWithPlaywright();
        const results = [];

        for (const meeting of meetings) {
          try {
            insertMeeting({
              id: `civicclerk-${meeting.eventId}`,
              date: meeting.date,
              title: meeting.title,
              type: meeting.type,
              location: meeting.location,
              agendaUrl: meeting.agendaUrl,
              minutesUrl: meeting.minutesUrl,
              packetUrl: meeting.agendaUrl,
              status: new Date(meeting.date) > new Date() ? 'upcoming' : 'past',
            });

            results.push({
              eventId: meeting.eventId,
              success: true,
              date: meeting.date,
              title: meeting.title,
            });
          } catch (error) {
            results.push({
              eventId: meeting.eventId,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        return NextResponse.json({
          success: true,
          meetingsFound: meetings.length,
          results,
          successful: results.filter(r => r.success).length,
        });
      }

      case 'bulk-meetings-with-agenda': {
        // First discover and import all meetings, then scrape agenda items for past meetings
        const { minYear, limit: batchLimit, forceRefresh = false } = params || {};
        console.log(`Starting bulk meetings with agenda items (minYear: ${minYear || 'all'})...`);

        // Step 1: Import all meetings using Playwright
        const meetings = await scrapeCivicClerkMeetingsWithPlaywright({ minYear });
        const meetingResults = [];

        for (const meeting of meetings) {
          try {
            insertMeeting({
              id: `civicclerk-${meeting.eventId}`,
              date: meeting.date,
              title: meeting.title,
              type: meeting.type,
              location: meeting.location,
              agendaUrl: meeting.agendaUrl,
              minutesUrl: meeting.minutesUrl,
              packetUrl: meeting.agendaUrl,
              status: new Date(meeting.date) > new Date() ? 'upcoming' : 'past',
            });
            meetingResults.push({ eventId: meeting.eventId, date: meeting.date, success: true });
          } catch (error) {
            meetingResults.push({ eventId: meeting.eventId, success: false, error: String(error) });
          }
        }

        console.log(`Imported ${meetingResults.filter(r => r.success).length} meetings`);

        // Step 2: For past meetings, scrape agenda items
        const today = new Date();
        const pastMeetings = meetings.filter(m => new Date(m.date) < today);
        const agendaResults = [];

        console.log(`Scraping agenda items for ${pastMeetings.length} past meetings...`);

        for (const meeting of pastMeetings) {
          try {
            const { agendaItems } = await scrapeCivicClerkMeetingDetails(meeting.eventId);

            for (const item of agendaItems) {
              insertAgendaItem({
                id: `civicclerk-${meeting.eventId}-item-${item.orderNum}`,
                meetingId: `civicclerk-${meeting.eventId}`,
                orderNum: item.orderNum,
                title: item.title,
                type: item.type,
                referenceNumber: item.referenceNumber,
              });
            }

            agendaResults.push({
              eventId: meeting.eventId,
              date: meeting.date,
              success: true,
              agendaItemCount: agendaItems.length,
            });
            console.log(`  Event ${meeting.eventId}: ${agendaItems.length} agenda items`);
          } catch (error) {
            agendaResults.push({
              eventId: meeting.eventId,
              success: false,
              error: String(error),
            });
          }
        }

        const totalAgendaItems = agendaResults
          .filter(r => r.success)
          .reduce((sum, r) => sum + (r.agendaItemCount || 0), 0);

        // Step 3: Link ordinances to meetings
        console.log('Linking ordinances to meetings...');
        const linkResult = linkOrdinancesToMeetings();
        console.log(`Linked ${linkResult.linked} ordinances to meetings`);

        // Step 4: Update ordinance adoption dates from meeting dates
        const datesUpdated = updateOrdinanceDatesFromMeetings();

        // Step 5: Extract resolutions from all agenda items
        console.log('Extracting resolutions from agenda items...');
        const resolutionsExtracted = extractResolutionsFromAgendaItems();
        console.log(`Extracted ${resolutionsExtracted} resolutions`);

        // Step 6: Auto-generate summaries for past meetings with agenda items
        // Respects batchLimit to prevent timeout issues
        // Filter to meetings without summaries (unless forceRefresh)
        const meetingsNeedingSummaries = pastMeetings.filter(meeting => {
          if (forceRefresh) return true;
          const meetingId = `civicclerk-${meeting.eventId}`;
          const existing = getMeetingById(meetingId) as MeetingRow | undefined;
          return !existing?.agenda_summary || !existing?.minutes_summary;
        });

        const meetingsToSummarize = meetingsNeedingSummaries.slice(0, batchLimit || 10);
        const summaryResults: { eventId: number; agenda?: string; minutes?: string }[] = [];

        if (meetingsToSummarize.length > 0) {
          console.log(`Generating summaries for ${meetingsToSummarize.length} past meetings (${pastMeetings.length - meetingsNeedingSummaries.length} already have summaries)...`);

          for (const meeting of meetingsToSummarize) {
            const meetingId = `civicclerk-${meeting.eventId}`;
            const existing = getMeetingById(meetingId) as MeetingRow | undefined;
            const result: { eventId: number; agenda?: string; minutes?: string } = { eventId: meeting.eventId };

            // Generate agenda summary if needed
            const needsAgenda = forceRefresh || !existing?.agenda_summary;
            if (needsAgenda) {
              try {
                console.log(`Fetching agenda PDF for ${meetingId}...`);
                const agendaPdf = await fetchCivicClerkAgendaPdf(meeting.eventId);

                if (agendaPdf) {
                  console.log(`Analyzing agenda for ${meetingId}...`);
                  const summary = await analyzePdf(`${meetingId}-agenda`, 'agenda', agendaPdf, { forceRefresh });
                  updateMeetingAgendaSummary(meetingId, summary);
                  result.agenda = 'generated';
                  console.log(`Generated agenda summary for ${meetingId}`);
                } else {
                  result.agenda = 'no_pdf';
                }
              } catch (error) {
                console.error(`Failed to generate agenda summary for ${meetingId}:`, error);
                result.agenda = 'error';
              }
            } else {
              result.agenda = 'skipped';
            }

            // Generate minutes summary if needed
            const needsMinutes = forceRefresh || !existing?.minutes_summary;
            if (needsMinutes) {
              try {
                console.log(`Fetching minutes PDF for ${meetingId}...`);
                const minutesPdf = await fetchCivicClerkMinutesPdf(meeting.eventId);

                if (minutesPdf) {
                  console.log(`Analyzing minutes for ${meetingId}...`);
                  const summary = await analyzePdf(`${meetingId}-minutes`, 'minutes', minutesPdf, { forceRefresh });
                  updateMeetingMinutesSummary(meetingId, summary);
                  result.minutes = 'generated';
                  console.log(`Generated minutes summary for ${meetingId}`);
                } else {
                  result.minutes = 'no_pdf';
                }
              } catch (error) {
                console.error(`Failed to generate minutes summary for ${meetingId}:`, error);
                result.minutes = 'error';
              }
            } else {
              result.minutes = 'skipped';
            }

            summaryResults.push(result);
          }
        }

        const agendasGenerated = summaryResults.filter(r => r.agenda === 'generated').length;
        const minutesGenerated = summaryResults.filter(r => r.minutes === 'generated').length;
        console.log(`Generated ${agendasGenerated} agenda summaries, ${minutesGenerated} minutes summaries`);

        return NextResponse.json({
          success: true,
          meetingsFound: meetings.length,
          meetingsImported: meetingResults.filter(r => r.success).length,
          pastMeetingsProcessed: pastMeetings.length,
          agendaItemsImported: totalAgendaItems,
          ordinancesLinked: linkResult.linked,
          ordinanceDatesUpdated: datesUpdated,
          ordinancesNotFound: linkResult.notFound,
          resolutionsExtracted,
          summariesGenerated: {
            agendas: agendasGenerated,
            minutes: minutesGenerated,
            total: meetingsToSummarize.length,
          },
          agendaResults,
        });
      }

      case 'bulk-permits': {
        // Scrape permits for multiple months, optionally multiple years
        const { year, years, months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] } = params || {};

        // Support either single year or array of years
        const yearsToProcess = years || (year ? [year] : null);
        if (!yearsToProcess) {
          return NextResponse.json({ error: 'year or years is required' }, { status: 400 });
        }

        const allResults: { year: string; month: string; success: boolean; permitCount?: number; sourceUrl?: string; error?: string }[] = [];

        for (const y of yearsToProcess) {
          for (const month of months) {
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
                error: error instanceof Error ? error.message : 'Unknown error',
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

      case 'generate-permit-summaries': {
        // Generate AI summaries for monthly permit reports
        const { years = getRecentYears(2), months = getAllMonths(), forceRefresh = false } = params || {};

        const results: { month: string; success: boolean; error?: string }[] = [];

        for (const year of years) {
          for (const month of months) {
            const monthKey = `${year}-${month}`;

            try {
              // Check if we already have a summary (unless forcing refresh)
              if (!forceRefresh) {
                const db = getDb();
                const existing = db.prepare(
                  "SELECT content FROM summaries WHERE entity_type = 'permit' AND entity_id = ? AND summary_type = 'pdf-analysis'"
                ).get(monthKey) as { content: string } | undefined;

                if (existing) {
                  results.push({ month: monthKey, success: true, error: 'Already exists (skipped)' });
                  continue;
                }
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

              const summary = await analyzePdf(monthKey, 'permit', pdfBase64, { forceRefresh });

              results.push({ month: monthKey, success: true });
              console.log(`Generated summary for ${monthKey}`);

            } catch (error) {
              results.push({
                month: monthKey,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
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

      case 'generate-business-summaries': {
        // Generate AI summaries for monthly business reports
        const { years = getRecentYears(2), months = getAllMonths(), forceRefresh = false } = params || {};

        const results: { month: string; success: boolean; error?: string }[] = [];

        for (const year of years) {
          for (const month of months) {
            const monthKey = `${year}-${month}`;

            try {
              if (!forceRefresh) {
                const db = getDb();
                const existing = db.prepare(
                  "SELECT content FROM summaries WHERE entity_type = 'business' AND entity_id = ? AND summary_type = 'pdf-analysis'"
                ).get(monthKey) as { content: string } | undefined;

                if (existing) {
                  results.push({ month: monthKey, success: true, error: 'Already exists (skipped)' });
                  continue;
                }
              }

              const urls = getBusinessPdfUrl(year, month);
              const pdfResult = await fetchPdfWithFallback(urls);

              if (!pdfResult) {
                results.push({ month: monthKey, success: false, error: 'PDF not found' });
                continue;
              }

              const pdfBase64 = pdfResult.buffer.toString('base64');
              console.log(`Analyzing businesses for ${monthKey}...`);

              const summary = await analyzePdf(monthKey, 'business', pdfBase64, { forceRefresh });

              results.push({ month: monthKey, success: true });
              console.log(`Generated summary for ${monthKey}`);

            } catch (error) {
              results.push({
                month: monthKey,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
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

      case 'generate-budget-summaries': {
        // Generate AI summaries for annual budget documents
        // Dynamically scrapes the city's Financial Reports page for budget PDFs
        const { forceRefresh = false, limit, model = 'gpt-4o-mini' } = params || {};

        // Dynamically discover budget documents from city website
        console.log('Discovering budget documents from city website...');
        let budgetDocuments = await getFinancialDocumentsByType('budget');
        console.log(`Found ${budgetDocuments.length} budget documents`);

        // Apply limit if specified (useful for testing)
        if (limit && limit > 0) {
          budgetDocuments = budgetDocuments.slice(0, limit);
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
            if (!forceRefresh) {
              const db = getDb();
              const existing = db.prepare(
                "SELECT content FROM summaries WHERE entity_type = 'budget' AND entity_id = ? AND summary_type = 'pdf-analysis'"
              ).get(doc.fiscalYear) as { content: string } | undefined;

              if (existing) {
                results.push({ fiscalYear: doc.fiscalYear, success: true, error: 'Already exists (skipped)', url: doc.url });
                continue;
              }
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
              forceRefresh,
              model,
              metadata: { pdfUrl: doc.url, title: doc.title },
            });

            results.push({ fiscalYear: doc.fiscalYear, success: true, url: doc.url, model });
            console.log(`Generated summary for ${doc.fiscalYear}`);

          } catch (error) {
            results.push({
              fiscalYear: doc.fiscalYear,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
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

      case 'generate-audit-summaries': {
        // Generate AI summaries for Annual Financial Reports (audited financial statements)
        // These show what actually happened vs budgets which show what was planned
        const { forceRefresh = false, limit } = params || {};

        // Dynamically discover audit documents from city website
        console.log('Discovering audit documents from city website...');
        let auditDocuments = await getFinancialDocumentsByType('audit');
        console.log(`Found ${auditDocuments.length} audit documents`);

        // Apply limit if specified (useful for testing)
        if (limit && limit > 0) {
          auditDocuments = auditDocuments.slice(0, limit);
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
            if (!forceRefresh) {
              const db = getDb();
              const existing = db.prepare(
                "SELECT content FROM summaries WHERE entity_type = 'audit' AND entity_id = ? AND summary_type = 'pdf-analysis'"
              ).get(doc.fiscalYear) as { content: string } | undefined;

              if (existing) {
                results.push({ fiscalYear: doc.fiscalYear, success: true, error: 'Already exists (skipped)', url: doc.url });
                continue;
              }
            }

            console.log(`Fetching audit PDF for ${doc.fiscalYear}...`);
            const pdfBase64 = await fetchPdfAsBase64(doc.url);

            if (!pdfBase64) {
              results.push({ fiscalYear: doc.fiscalYear, success: false, error: 'PDF not found', url: doc.url });
              continue;
            }

            console.log(`Analyzing audit for ${doc.fiscalYear}...`);
            await analyzePdf(doc.fiscalYear, 'audit', pdfBase64, {
              forceRefresh,
              metadata: { pdfUrl: doc.url, title: doc.title },
            });

            results.push({ fiscalYear: doc.fiscalYear, success: true, url: doc.url });
            console.log(`Generated summary for ${doc.fiscalYear}`);

          } catch (error) {
            results.push({
              fiscalYear: doc.fiscalYear,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
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

      case 'generate-civic-summaries': {
        // Generate AI summaries for civic documents (SPLOST, Public Notices, Strategic Plans, Water Quality)
        // Dynamically discovers documents from city website pages
        const { docType, forceRefresh = false, limit } = params || {};

        if (!docType || !['splost', 'notice', 'strategic', 'water-quality'].includes(docType)) {
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
        if (limit && limit > 0) {
          documents = documents.slice(0, limit);
          console.log(`Limited to ${documents.length} documents for processing`);
        }

        const results: { id: string; title: string; success: boolean; error?: string; url?: string }[] = [];

        for (const doc of documents) {
          try {
            // Check if we already have a summary
            if (!forceRefresh) {
              const db = getDb();
              const existing = db.prepare(
                "SELECT content FROM summaries WHERE entity_type = ? AND entity_id = ? AND summary_type = 'pdf-analysis'"
              ).get(civicDocType, doc.id) as { content: string } | undefined;

              if (existing) {
                results.push({ id: doc.id, title: doc.title, success: true, error: 'Already exists (skipped)', url: doc.url });
                continue;
              }
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
              forceRefresh,
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
              error: error instanceof Error ? error.message : 'Unknown error',
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

      case 'generate-meeting-summaries': {
        // Generate AI summaries for meeting agendas and/or minutes
        // summaryType: 'agenda' | 'minutes' | 'both' (default: based on meeting status)
        const { limit = 5, status = 'all', summaryType, forceRefresh = false } = params || {};

        // Get meetings from database
        const db = getDb();
        let query = 'SELECT id, title, date, status, agenda_summary, minutes_summary FROM meetings WHERE 1=1';
        const queryParams: (string | number)[] = [];

        if (status && status !== 'all') {
          query += ' AND status = ?';
          queryParams.push(status);
        }

        // Filter based on what summaries are missing (unless forceRefresh)
        if (!forceRefresh) {
          if (summaryType === 'agenda') {
            query += " AND (agenda_summary IS NULL OR agenda_summary = '')";
          } else if (summaryType === 'minutes') {
            query += " AND (minutes_summary IS NULL OR minutes_summary = '')";
          } else {
            // For 'both' or auto-detect, get meetings missing any summary
            query += " AND (agenda_summary IS NULL OR agenda_summary = '' OR minutes_summary IS NULL OR minutes_summary = '')";
          }
        }

        query += ' ORDER BY date DESC LIMIT ?';
        queryParams.push(limit);

        const meetings = db.prepare(query).all(...queryParams) as {
          id: string;
          title: string;
          date: string;
          status: string;
          agenda_summary: string | null;
          minutes_summary: string | null;
        }[];

        const results = [];
        for (const meeting of meetings) {
          const result: { id: string; agenda?: string; minutes?: string; errors?: string[] } = { id: meeting.id };
          const errors: string[] = [];

          // Extract event ID from meeting ID (format: civicclerk-XX)
          const eventIdMatch = meeting.id.match(/civicclerk-(\d+)/);
          if (!eventIdMatch) {
            results.push({ id: meeting.id, success: false, error: 'Invalid meeting ID format' });
            continue;
          }

          const eventId = parseInt(eventIdMatch[1]);

          // Determine what to generate
          const shouldGenerateAgenda = summaryType === 'agenda' || summaryType === 'both' ||
            (!summaryType && (forceRefresh || !meeting.agenda_summary));
          const shouldGenerateMinutes = (summaryType === 'minutes' || summaryType === 'both' ||
            (!summaryType && meeting.status === 'past')) && (forceRefresh || !meeting.minutes_summary);

          // Try to generate agenda summary
          if (shouldGenerateAgenda) {
            try {
              console.log(`Fetching agenda PDF for meeting ${meeting.id} (event ${eventId})...`);
              const pdfBase64 = await fetchCivicClerkAgendaPdf(eventId);

              if (pdfBase64) {
                console.log(`Analyzing agenda for meeting ${meeting.id}...`);
                const summary = await analyzePdf(`${meeting.id}-agenda`, 'agenda', pdfBase64, { forceRefresh });
                updateMeetingAgendaSummary(meeting.id, summary);
                result.agenda = 'generated';
                console.log(`Generated agenda summary for meeting ${meeting.id}`);
              } else {
                result.agenda = 'no_pdf';
                errors.push('Agenda PDF not available');
              }
            } catch (error) {
              result.agenda = 'error';
              errors.push(`Agenda: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }

          // Try to generate minutes summary (only for past meetings with approved minutes)
          if (shouldGenerateMinutes) {
            try {
              console.log(`Fetching minutes PDF for meeting ${meeting.id} (event ${eventId})...`);
              const minutesPdfBase64 = await fetchCivicClerkMinutesPdf(eventId);

              if (minutesPdfBase64) {
                console.log(`Analyzing minutes for meeting ${meeting.id}...`);
                const summary = await analyzePdf(`${meeting.id}-minutes`, 'minutes', minutesPdfBase64, { forceRefresh });
                updateMeetingMinutesSummary(meeting.id, summary);
                result.minutes = 'generated';
                console.log(`Generated minutes summary for meeting ${meeting.id}`);
              } else {
                result.minutes = 'no_pdf';
                errors.push('Minutes PDF not available (may not be approved yet)');
              }
            } catch (error) {
              result.minutes = 'error';
              errors.push(`Minutes: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }

          if (errors.length > 0) {
            result.errors = errors;
          }

          results.push({
            ...result,
            success: result.agenda === 'generated' || result.minutes === 'generated',
          });
        }

        return NextResponse.json({
          success: true,
          processed: results.length,
          successful: results.filter(r => r.success).length,
          results,
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid scrape type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Scrape error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}
