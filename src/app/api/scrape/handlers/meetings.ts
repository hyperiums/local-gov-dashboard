// Meeting-related scrape handlers
import { NextResponse } from 'next/server';
import {
  scrapeCivicClerkMeetingDetails,
  scrapeCivicClerkMeetingsWithPlaywright,
  discoverCivicClerkEventIds,
  fetchCivicClerkAgendaPdf,
  fetchCivicClerkMinutesPdf,
  linkOrdinancesToMeetings,
  updateOrdinanceDatesFromMeetings,
  extractResolutionsFromAgendaItems,
  fetchCivicClerkResolutionAttachments,
  createOrdinanceFromAgendaItem,
  fetchVoteOutcomesFromOverview,
  fetchCivicClerkOrdinanceAttachments,
} from '@/lib/scraper';
import { analyzePdf, analyzeOrdinancePdf } from '@/lib/summarize';
import { actionRank, extractOrdinanceNumbers, extractResolutionNumbers, resolveOrdinanceVote } from '@/lib/ordinanceRefs';
import {
  insertMeeting,
  insertAgendaItem,
  getOrdinanceByNumber,
  getResolutions,
  getMeetingById,
  updateResolutionSummary,
  updateMeetingAgendaSummary,
  updateMeetingMinutesSummary,
  updateOrdinanceSummary,
  getOrdinancesForMeeting,
  getDb,
  type MeetingRow,
} from '@/lib/db';
import { cityName } from '@/lib/city-config-client';
import { formatError, extractEventId, getMeetingStatus, type HandlerParams } from './shared';

export async function handleMeeting(params: HandlerParams) {
  // Scrape a specific CivicClerk meeting
  // fullRefresh: also generate agenda summary and extract resolutions
  const eventId = params?.eventId as number | undefined;
  const fullRefresh = (params?.fullRefresh as boolean) ?? false;

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
      status: getMeetingStatus(meeting.date),
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
      const isOrdinanceItem =
        item.type === 'ordinance' ||
        (item.type === 'public_hearing' && item.title.toLowerCase().includes('ordinance'));
      if (!isOrdinanceItem) continue;

      // An item can move several ordinances at once, so each referenced number
      // gets its own record rather than only the first.
      const numbers = item.referenceNumbers?.length
        ? item.referenceNumbers
        : item.referenceNumber
          ? [item.referenceNumber]
          : [];

      for (const number of numbers) {
        const existing = getOrdinanceByNumber(number);
        if (!existing) {
          createOrdinanceFromAgendaItem(number, item.title, meeting.date);
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

export async function handleDiscoverMeetings() {
  // Discover valid CivicClerk event IDs using Playwright
  const validIds = await discoverCivicClerkEventIds();

  return NextResponse.json({
    success: true,
    validIds,
    count: validIds.length,
  });
}

export async function handleBulkMeetings() {
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
        status: getMeetingStatus(meeting.date),
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

export async function handleBulkMeetingsWithAgenda(params: HandlerParams) {
  // First discover and import all meetings, then scrape agenda items for past meetings
  const { minYear, limit: batchLimit, forceRefresh = false } = params || {};
  console.log(`Starting bulk meetings with agenda items (minYear: ${minYear || 'all'})...`);

  // Step 1: Import all meetings using Playwright
  const meetings = await scrapeCivicClerkMeetingsWithPlaywright({ minYear: minYear as number | undefined });
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
        status: getMeetingStatus(meeting.date),
      });
      meetingResults.push({ eventId: meeting.eventId, date: meeting.date, success: true });
    } catch (error) {
      meetingResults.push({ eventId: meeting.eventId, success: false, error: formatError(error) });
    }
  }

  console.log(`Imported ${meetingResults.filter(r => r.success).length} meetings`);

  // Step 2: For past meetings, scrape agenda items
  const today = new Date();
  const pastMeetings = meetings.filter(m => new Date(m.date) < today);
  const agendaResults: {
    eventId: number;
    date?: string;
    success: boolean;
    agendaItemCount?: number;
    skipped?: boolean;
    error?: string;
  }[] = [];

  console.log(`Scraping agenda items for ${pastMeetings.length} past meetings...`);

  const db = getDb();

  for (const meeting of pastMeetings) {
    const meetingId = `civicclerk-${meeting.eventId}`;

    // Skip if agenda items already exist (unless forceRefresh is true)
    const existingCount = (db.prepare(
      'SELECT COUNT(*) as count FROM agenda_items WHERE meeting_id = ?'
    ).get(meetingId) as { count: number }).count;

    if (existingCount > 0 && !forceRefresh) {
      agendaResults.push({
        eventId: meeting.eventId,
        date: meeting.date,
        success: true,
        agendaItemCount: existingCount,
        skipped: true,
      });
      console.log(`  Event ${meeting.eventId}: Skipped (${existingCount} existing items)`);
      continue;
    }

    try {
      const { agendaItems } = await scrapeCivicClerkMeetingDetails(meeting.eventId);

      for (const item of agendaItems) {
        insertAgendaItem({
          id: `civicclerk-${meeting.eventId}-item-${item.orderNum}`,
          meetingId: meetingId,
          orderNum: item.orderNum,
          title: item.title,
          type: item.type,
          referenceNumber: item.referenceNumber,
        });
      }

      // Auto-create ordinance records for references not yet in the database
      for (const item of agendaItems) {
        if (item.referenceNumber && (
          item.type === 'ordinance' ||
          (item.type === 'public_hearing' && item.title.toLowerCase().includes('ordinance'))
        )) {
          const existing = getOrdinanceByNumber(item.referenceNumber);
          if (!existing) {
            createOrdinanceFromAgendaItem(
              item.referenceNumber,
              item.title,
              meeting.date
            );
          }
        }
      }

      agendaResults.push({
        eventId: meeting.eventId,
        date: meeting.date,
        success: true,
        agendaItemCount: agendaItems.length,
        skipped: false,
      });
      console.log(`  Event ${meeting.eventId}: ${agendaItems.length} agenda items`);
    } catch (error) {
      agendaResults.push({
        eventId: meeting.eventId,
        success: false,
        error: formatError(error),
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

  // Step 4.5: Generate summaries for newly-created ordinances using CivicClerk attachments
  // Ordinances at first reading aren't on Municode yet, so we fetch the individual
  // ordinance PDF attachments from the CivicClerk meeting files sidebar
  let ordinanceSummariesGenerated = 0;
  const newlyScrapedMeetings = agendaResults.filter(r => r.success && !r.skipped);

  for (const result of newlyScrapedMeetings) {
    const meetingId = `civicclerk-${result.eventId}`;
    const meetingOrdinances = getOrdinancesForMeeting(meetingId);
    const unsummarized = meetingOrdinances.filter(o => !o.summary && !o.municode_url);

    if (unsummarized.length === 0) continue;

    console.log(`Fetching ordinance attachments from CivicClerk for ${meetingId} (${unsummarized.length} ordinances)...`);

    try {
      const ordinanceNumbers = unsummarized.map(o => o.number);
      const pdfMap = await fetchCivicClerkOrdinanceAttachments(result.eventId!, ordinanceNumbers);

      for (const ordinance of unsummarized) {
        const pdfBase64 = pdfMap.get(ordinance.number);
        if (!pdfBase64) {
          console.log(`  No PDF attachment for Ordinance ${ordinance.number}`);
          continue;
        }

        try {
          const summary = await analyzeOrdinancePdf(ordinance.number, pdfBase64);
          updateOrdinanceSummary(ordinance.id, summary);
          ordinanceSummariesGenerated++;
          console.log(`  Generated summary for Ordinance ${ordinance.number}`);
        } catch (error) {
          console.error(`  Failed to summarize Ordinance ${ordinance.number}:`, error);
        }
      }
    } catch (error) {
      console.error(`  Failed to fetch ordinance attachments for ${meetingId}:`, error);
    }
  }

  if (ordinanceSummariesGenerated > 0) {
    console.log(`Generated ${ordinanceSummariesGenerated} ordinance summaries from CivicClerk attachments`);
  }

  // Step 5: Extract resolutions from all agenda items
  console.log('Extracting resolutions from agenda items...');
  const resolutionsExtracted = extractResolutionsFromAgendaItems();
  console.log(`Extracted ${resolutionsExtracted} resolutions`);

  // Step 5.5: Fetch vote outcomes for meetings with unverified items
  // Must run AFTER resolution extraction to avoid INSERT OR REPLACE overwriting updates
  // Check ALL past meetings in the database, not just newly discovered ones
  console.log('Checking for vote outcome updates...');
  let resolutionsUpdated = 0;
  let ordinancesUpdated = 0;

  // Get all past meetings from database that might need vote outcome processing
  const allPastMeetings = db.prepare(`
    SELECT DISTINCT m.id,
           CAST(REPLACE(m.id, 'civicclerk-', '') AS INTEGER) as eventId,
           m.date
    FROM meetings m
    WHERE m.status = 'past'
      AND m.id LIKE 'civicclerk-%'
      AND (
        EXISTS (SELECT 1 FROM resolutions r WHERE r.meeting_id = m.id AND r.outcome_verified = 0)
        OR EXISTS (
          SELECT 1 FROM ordinance_meetings om
          JOIN ordinances o ON o.id = om.ordinance_id
          WHERE om.meeting_id = m.id AND o.status = 'proposed'
        )
        -- Also check meetings whose ordinance items are not linked yet.
        -- Keying only off already-linked proposed ordinances was circular: an
        -- item nothing had managed to link was never checked for a vote, so it
        -- never got linked. That is how two ordinances read on June 18 and
        -- again on July 15 stayed invisible.
        OR EXISTS (
          SELECT 1 FROM agenda_items ai
          WHERE ai.meeting_id = m.id
            AND ai.type IN ('ordinance', 'resolution')
            AND NOT EXISTS (
              SELECT 1 FROM ordinance_meetings om2
              WHERE om2.meeting_id = m.id AND om2.outcome_verified = 1
            )
        )
      )
    ORDER BY m.date DESC
  `).all() as { id: string; eventId: number; date: string }[];

  console.log(`  Found ${allPastMeetings.length} meetings needing vote outcome checks`);

  for (const meeting of allPastMeetings) {
    const meetingId = meeting.id;

    // Get counts for logging (we already know this meeting needs processing from the query)
    const unverifiedResolutions = (db.prepare(
      'SELECT COUNT(*) as count FROM resolutions WHERE meeting_id = ? AND outcome_verified = 0'
    ).get(meetingId) as { count: number }).count;

    const proposedOrdinances = (db.prepare(`
      SELECT COUNT(*) as count FROM ordinance_meetings om
      JOIN ordinances o ON o.id = om.ordinance_id
      WHERE om.meeting_id = ? AND o.status = 'proposed'
    `).get(meetingId) as { count: number }).count;

    console.log(`  Event ${meeting.eventId} (${meeting.date}): ${unverifiedResolutions} unverified resolutions, ${proposedOrdinances} proposed ordinances`);
    const voteOutcomes = await fetchVoteOutcomesFromOverview(meeting.eventId);

    if (voteOutcomes.length === 0) {
      console.log(`    No vote outcomes found on overview page`);
      continue;
    }

    console.log(`    Found ${voteOutcomes.length} vote outcomes`);

    for (const vote of voteOutcomes) {
      console.log(`    Processing vote: "${vote.itemTitle.slice(0, 80)}..." motion=${vote.motion} result=${vote.result}`);

      // Check for resolution votes
      for (const resNumber of extractResolutionNumbers(vote.itemTitle)) {
        const status = vote.result === 'passed' ? 'adopted' :
                       vote.result === 'failed' ? 'rejected' : 'tabled';
        const result = db.prepare(`
          UPDATE resolutions SET status = ?, outcome_verified = 1,
            adopted_date = CASE WHEN ? = 'adopted' THEN ? ELSE adopted_date END
          WHERE number = ? AND outcome_verified = 0
        `).run(status, status, meeting.date, resNumber);

        if (result.changes > 0) {
          console.log(`    ✓ Resolution ${resNumber}: ${vote.result} → status=${status}`);
          resolutionsUpdated++;
        } else {
          console.log(`    - Resolution ${resNumber}: ${vote.result} (no update needed)`);
        }
      }

      // Check for ordinance votes (any reading, any result). One vote can carry
      // several ordinances — the council moves companion zoning amendments
      // together — so each referenced number is updated.
      for (const ordNumber of extractOrdinanceNumbers(vote.itemTitle)) {
        const { action, newStatus, verified } = resolveOrdinanceVote(vote);

        // Update ordinance_meetings.action. A confidently read outcome is
        // marked verified so a later link-ordinances pass cannot overwrite a
        // recorded vote with a guess derived from the agenda title. The rank
        // guard stops a vaguer reading from demoting a more specific one that
        // is already recorded.
        const existing = db.prepare(`
          SELECT om.action FROM ordinance_meetings om
          JOIN ordinances o ON o.id = om.ordinance_id
          WHERE om.meeting_id = ? AND (o.number = ? OR o.number LIKE ?)
        `).get(meetingId, ordNumber, `%${ordNumber}`) as { action: string | null } | undefined;

        const omResult = actionRank(action) >= actionRank(existing?.action)
          ? db.prepare(`
              UPDATE ordinance_meetings SET action = ?, outcome_verified = ?
              WHERE meeting_id = ? AND ordinance_id IN (
                SELECT id FROM ordinances WHERE number = ? OR number LIKE ?
              )
            `).run(action, verified ? 1 : 0, meetingId, ordNumber, `%${ordNumber}`)
          : { changes: 0 };

        // Update ordinances.status if terminal action
        if (newStatus) {
          const ordResult = db.prepare(`
            UPDATE ordinances SET status = ?,
              adopted_date = CASE WHEN ? = 'adopted' THEN ? ELSE adopted_date END
            WHERE (number = ? OR number LIKE ?) AND status = 'proposed'
          `).run(newStatus, newStatus, meeting.date, ordNumber, `%${ordNumber}`);

          if (ordResult.changes > 0) {
            console.log(`    ✓ Ordinance ${ordNumber}: ${vote.motion} ${vote.result} → status=${newStatus}`);
            ordinancesUpdated++;
          }
        }

        if (omResult.changes > 0) {
          console.log(`    ✓ Ordinance ${ordNumber}: action updated to ${action}`);
        }
      }
    }
  }

  const votesUpdated = resolutionsUpdated + ordinancesUpdated;
  console.log(`Vote outcomes: ${resolutionsUpdated} resolutions updated, ${ordinancesUpdated} ordinances updated`);

  // Re-derive adoption dates now that the votes above are known. Step 4 ran
  // before them, so without this an adoption recorded in this run would not
  // reach the ordinance until the next scrape.
  updateOrdinanceDatesFromMeetings();

  // Step 6: Auto-generate summaries for past meetings with agenda items
  // Respects batchLimit to prevent timeout issues
  // Filter to meetings without summaries (unless forceRefresh)
  const meetingsNeedingSummaries = pastMeetings.filter(meeting => {
    if (forceRefresh) return true;
    const meetingId = `civicclerk-${meeting.eventId}`;
    const existing = getMeetingById(meetingId) as MeetingRow | undefined;
    return !existing?.agenda_summary || !existing?.minutes_summary;
  });

  const meetingsToSummarize = meetingsNeedingSummaries.slice(0, (batchLimit as number) || 10);
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
            const summary = await analyzePdf(`${meetingId}-agenda`, 'agenda', agendaPdf, { forceRefresh: forceRefresh as boolean });
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
            const summary = await analyzePdf(`${meetingId}-minutes`, 'minutes', minutesPdf, { forceRefresh: forceRefresh as boolean });
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

  // Step 6.5: Generate agenda summaries for upcoming meetings
  // Agendas are published before meetings, so we can summarize them early
  const upcomingMeetings = meetings
    .filter(m => new Date(m.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Soonest first

  const upcomingNeedingSummaries = upcomingMeetings.filter(meeting => {
    const meetingId = `civicclerk-${meeting.eventId}`;
    const existing = getMeetingById(meetingId) as MeetingRow | undefined;
    return meeting.agendaUrl && !existing?.agenda_summary;
  });

  let upcomingAgendasGenerated = 0;
  let upcomingNoPdf = 0;
  const upcomingLimit = (batchLimit as number) || 5;

  if (upcomingNeedingSummaries.length > 0) {
    console.log(`\n=== Step 6.5: Upcoming Meeting Agenda Summaries ===`);
    console.log(`Found ${upcomingMeetings.length} upcoming meetings, ${upcomingNeedingSummaries.length} need agenda summaries`);
    console.log(`Processing up to ${upcomingLimit} meetings (soonest first)...`);

    for (const meeting of upcomingNeedingSummaries.slice(0, upcomingLimit)) {
      const meetingId = `civicclerk-${meeting.eventId}`;
      try {
        console.log(`  ${meeting.date} (${meetingId}): Fetching agenda PDF...`);
        const agendaPdf = await fetchCivicClerkAgendaPdf(meeting.eventId);

        if (agendaPdf) {
          console.log(`  ${meeting.date} (${meetingId}): Analyzing agenda...`);
          const summary = await analyzePdf(`${meetingId}-agenda`, 'agenda', agendaPdf, {});
          updateMeetingAgendaSummary(meetingId, summary);
          upcomingAgendasGenerated++;
          console.log(`  ${meeting.date} (${meetingId}): ✓ Generated agenda summary`);
        } else {
          upcomingNoPdf++;
          console.log(`  ${meeting.date} (${meetingId}): No PDF available yet`);
        }
      } catch (error) {
        console.error(`  ${meeting.date} (${meetingId}): ✗ Error -`, error);
      }
    }

    console.log(`Upcoming agenda summaries: ${upcomingAgendasGenerated} generated, ${upcomingNoPdf} no PDF available`);
  } else if (upcomingMeetings.length > 0) {
    console.log(`\n=== Step 6.5: Upcoming Meeting Agenda Summaries ===`);
    console.log(`All ${upcomingMeetings.length} upcoming meetings already have agenda summaries`);
  }

  // Calculate agenda scraping breakdown
  const skippedMeetings = agendaResults.filter(r => r.skipped).length;
  const scrapedMeetings = agendaResults.filter(r => r.success && !r.skipped).length;
  const failedMeetings = agendaResults.filter(r => !r.success).length;

  return NextResponse.json({
    success: true,
    meetingsFound: meetings.length,
    meetingsImported: meetingResults.filter(r => r.success).length,
    pastMeetingsProcessed: pastMeetings.length,
    agendaItemsImported: totalAgendaItems,
    agendaScraping: {
      scraped: scrapedMeetings,
      skipped: skippedMeetings,
      failed: failedMeetings,
    },
    ordinancesLinked: linkResult.linked,
    ordinanceDatesUpdated: datesUpdated,
    ordinancesNotFound: linkResult.notFound,
    ordinanceSummariesGenerated,
    resolutionsExtracted,
    votesUpdated,
    summariesGenerated: {
      agendas: agendasGenerated,
      minutes: minutesGenerated,
      upcomingAgendas: upcomingAgendasGenerated,
      total: meetingsToSummarize.length,
    },
    agendaResults,
  });
}

export async function handleGenerateMeetingSummaries(params: HandlerParams) {
  // Generate AI summaries for meeting agendas and/or minutes
  // summaryType: 'agenda' | 'minutes' | 'both' (default: based on meeting status)
  const { limit = 5, status = 'all', summaryType, forceRefresh = false } = params || {};

  // Get meetings from database
  const db = getDb();
  let query = 'SELECT id, title, date, status, agenda_summary, minutes_summary FROM meetings WHERE 1=1';
  const queryParams: (string | number)[] = [];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    queryParams.push(status as string);
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
  queryParams.push(limit as number);

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
    const eventId = extractEventId(meeting.id);
    if (!eventId) {
      results.push({ id: meeting.id, success: false, error: 'Invalid meeting ID format' });
      continue;
    }

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
          const summary = await analyzePdf(`${meeting.id}-agenda`, 'agenda', pdfBase64, { forceRefresh: forceRefresh as boolean });
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
          const summary = await analyzePdf(`${meeting.id}-minutes`, 'minutes', minutesPdfBase64, { forceRefresh: forceRefresh as boolean });
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
