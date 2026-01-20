import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  handleMeeting,
  handleDiscoverMeetings,
  handleBulkMeetings,
  handleBulkMeetingsWithAgenda,
  handleGenerateMeetingSummaries,
  handleOrdinances,
  handleSyncMunicodeSupplements,
  handleLinkOrdinances,
  handleGenerateOrdinanceSummaries,
  handleExtractResolutions,
  handleBackfillResolutionOutcomes,
  handleGenerateResolutionSummaries,
  handlePermits,
  handleBulkPermits,
  handleGeneratePermitSummaries,
  handleFinancial,
  handleGenerateBudgetSummaries,
  handleGenerateAuditSummaries,
  handleGenerateBusinessSummaries,
  handleGenerateCivicSummaries,
  handleResetDatabase,
} from './handlers';

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
      // Meeting operations
      case 'meeting':
        return handleMeeting(params);
      case 'discover-meetings':
        return handleDiscoverMeetings();
      case 'bulk-meetings':
        return handleBulkMeetings();
      case 'bulk-meetings-with-agenda':
        return handleBulkMeetingsWithAgenda(params);
      case 'generate-meeting-summaries':
        return handleGenerateMeetingSummaries(params);

      // Ordinance operations
      case 'ordinances':
        return handleOrdinances(params);
      case 'sync-municode-supplements':
        return handleSyncMunicodeSupplements();
      case 'link-ordinances':
        return handleLinkOrdinances(params);
      case 'generate-ordinance-summaries':
        return handleGenerateOrdinanceSummaries(params);

      // Resolution operations
      case 'extract-resolutions':
        return handleExtractResolutions();
      case 'backfill-resolution-outcomes':
        return handleBackfillResolutionOutcomes(params);
      case 'generate-resolution-summaries':
        return handleGenerateResolutionSummaries(params);

      // Permit operations
      case 'permits':
        return handlePermits(params);
      case 'bulk-permits':
        return handleBulkPermits(params);
      case 'generate-permit-summaries':
        return handleGeneratePermitSummaries(params);

      // Financial operations
      case 'financial':
        return handleFinancial();
      case 'generate-budget-summaries':
        return handleGenerateBudgetSummaries(params);
      case 'generate-audit-summaries':
        return handleGenerateAuditSummaries(params);
      case 'generate-business-summaries':
        return handleGenerateBusinessSummaries(params);

      // Civic document operations
      case 'generate-civic-summaries':
        return handleGenerateCivicSummaries(params);

      // Admin operations
      case 'reset-database':
        return handleResetDatabase();

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
