import { NextResponse } from 'next/server';
import {
  getMeetings,
  getMeetingById,
  getAgendaItemsByMeeting,
  getPermitsByMonth,
  getPermitStats,
  getAllPermits,
  getPermitSummaryStats,
  getOrdinances,
  getPendingOrdinancesWithProgress,
  getResolutions,
  getDashboardStats,
  getRecentActivity,
  getMeetingsForOrdinance,
  getOrdinancesForMeeting,
  getDb,
  getAllSummaryLevels,
  MeetingRow,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/data - Retrieve dashboard data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    // Ensure database is initialized
    getDb();

    switch (type) {
      case 'dashboard': {
        const stats = getDashboardStats();
        const recentActivity = getRecentActivity(10);
        const upcomingMeetings = getMeetings({ status: 'upcoming', limit: 5 });
        const recentMeetings = getMeetings({ status: 'past', limit: 5 });

        return NextResponse.json({
          stats,
          recentActivity,
          upcomingMeetings,
          recentMeetings,
        });
      }

      case 'meetings': {
        const status = searchParams.get('status') || undefined;
        const limit = searchParams.get('limit')
          ? parseInt(searchParams.get('limit')!)
          : undefined;
        let meetings = getMeetings({ status, limit });

        // Ensure at least one upcoming meeting is shown (even without agenda items)
        if (!status || status === 'upcoming') {
          const hasUpcoming = meetings.some(m => m.status === 'upcoming');
          if (!hasUpcoming) {
            const db = getDb();
            const nextMeeting = db.prepare(`
              SELECT * FROM meetings WHERE status = 'upcoming' ORDER BY date ASC LIMIT 1
            `).get() as MeetingRow | undefined;
            if (nextMeeting) {
              meetings = [nextMeeting, ...meetings];
            }
          }
        }

        return NextResponse.json({ meetings });
      }

      case 'meeting': {
        const id = searchParams.get('id');
        if (!id) {
          return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }
        const meeting = getMeetingById(id);
        const agendaItems = getAgendaItemsByMeeting(id);
        return NextResponse.json({ meeting, agendaItems });
      }

      case 'meeting-detail': {
        // Extended meeting data for timeline expand
        const id = searchParams.get('id');
        if (!id) {
          return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const db = getDb();

        // Get meeting info
        const meeting = db.prepare(`
          SELECT id, date, title, type, summary, agenda_url, minutes_url
          FROM meetings WHERE id = ?
        `).get(id) as {
          id: string;
          date: string;
          title: string;
          type: string;
          summary: string | null;
          agenda_url: string | null;
          minutes_url: string | null;
        } | undefined;

        if (!meeting) {
          return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }

        // Get all agenda items
        const agendaItems = db.prepare(`
          SELECT id, order_num, title, description
          FROM agenda_items
          WHERE meeting_id = ?
          ORDER BY order_num ASC, id ASC
        `).all(id) as Array<{
          id: string;
          order_num: number;
          title: string;
          description: string | null;
        }>;

        // Get related ordinances discussed at this meeting
        const relatedOrdinances = db.prepare(`
          SELECT o.id, o.number, o.title, om.action
          FROM ordinance_meetings om
          JOIN ordinances o ON o.id = om.ordinance_id
          WHERE om.meeting_id = ?
          ORDER BY o.number DESC
        `).all(id) as Array<{
          id: string;
          number: string;
          title: string;
          action: string | null;
        }>;

        return NextResponse.json({
          meeting,
          agendaItems,
          relatedOrdinances,
        });
      }

      case 'permits': {
        const month = searchParams.get('month');
        const all = searchParams.get('all');
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

        if (month) {
          const permits = getPermitsByMonth(month);
          return NextResponse.json({ permits });
        }

        if (all === 'true') {
          const permits = getAllPermits({ limit });
          return NextResponse.json({ permits });
        }

        // Return permit stats for the last 12 months
        const now = new Date();
        const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

        const stats = getPermitStats(startMonth, endMonth);
        return NextResponse.json({ stats });
      }

      case 'permit-stats': {
        const stats = getPermitSummaryStats();
        return NextResponse.json({ stats });
      }

      case 'permit-chart-data': {
        // Get permit data for trend charts from AI summaries (more accurate than scraped data)
        const db = getDb();

        // Get all permit summaries and extract counts using regex
        const summaries = db.prepare(`
          SELECT entity_id as month, content
          FROM summaries
          WHERE entity_type = 'permit' AND summary_type = 'pdf-analysis'
          ORDER BY entity_id ASC
        `).all() as { month: string; content: string }[];

        // Extract permit counts from AI summaries
        const monthlyData: { month: string; count: number; total_value: number }[] = [];
        for (const summary of summaries) {
          // Match patterns like "A total of 24 permits were issued" or "24 permits were issued"
          const match = summary.content.match(/(?:total of\s+)?(\d+)\s+permits?\s+were\s+issued/i);
          if (match) {
            monthlyData.push({
              month: summary.month,
              count: parseInt(match[1], 10),
              total_value: 0, // We don't have value data from summaries
            });
          }
        }

        // Extract type breakdown from summaries (aggregate new construction counts)
        // Parse "X new homes" and "Y home improvements" patterns
        let newConstructionTotal = 0;
        let homeImprovementsTotal = 0;
        for (const summary of summaries) {
          const newHomesMatch = summary.content.match(/(\d+)\s+new\s+(homes?|construction)/i);
          if (newHomesMatch) {
            newConstructionTotal += parseInt(newHomesMatch[1], 10);
          }
          // Home improvements often mentioned as difference between total and new construction
          const totalMatch = summary.content.match(/(\d+)\s+permits?\s+were\s+issued/i);
          if (totalMatch && newHomesMatch) {
            const total = parseInt(totalMatch[1], 10);
            const newHomes = parseInt(newHomesMatch[1], 10);
            homeImprovementsTotal += Math.max(0, total - newHomes);
          }
        }

        const typeBreakdown = [
          { type: 'new construction', count: newConstructionTotal },
          { type: 'home improvements', count: homeImprovementsTotal },
        ].filter(t => t.count > 0);

        // Year-over-year data from monthly data
        const yearOverYear: { year: string; monthNum: string; count: number }[] = [];
        for (const m of monthlyData) {
          const [year, monthNum] = m.month.split('-');
          yearOverYear.push({ year, monthNum, count: m.count });
        }

        // Get unique years
        const years = [...new Set(monthlyData.map(d => d.month.split('-')[0]))].sort();

        return NextResponse.json({
          monthly: monthlyData,
          byType: typeBreakdown,
          yearOverYear,
          years,
          totals: {
            permits: monthlyData.reduce((sum, m) => sum + m.count, 0),
            months: monthlyData.length,
          },
        });
      }

      case 'development-summaries': {
        // Get AI-generated monthly summaries for permits and businesses
        const db = getDb();

        // Join with permits table to get actual source URLs (city changed URL format over time)
        const permitSummaries = db.prepare(`
          SELECT s.entity_id as month, s.content as summary, p.source_url as pdfUrl
          FROM summaries s
          LEFT JOIN (
            SELECT month, source_url FROM permits GROUP BY month
          ) p ON p.month = s.entity_id
          WHERE s.entity_type = 'permit' AND s.summary_type = 'pdf-analysis'
          ORDER BY s.entity_id DESC
        `).all() as { month: string; summary: string; pdfUrl: string | null }[];

        // Get business summaries (UI constructs PDF URLs from month)
        const businessSummaries = db.prepare(`
          SELECT entity_id as month, content as summary
          FROM summaries
          WHERE entity_type = 'business' AND summary_type = 'pdf-analysis'
          ORDER BY entity_id DESC
        `).all() as { month: string; summary: string }[];

        return NextResponse.json({
          permits: permitSummaries,
          businesses: businessSummaries,
        });
      }

      case 'budget-summaries': {
        // Get AI-generated summaries for budget documents
        const db = getDb();

        const budgetSummaries = db.prepare(`
          SELECT entity_id as fiscalYear, content as summary, metadata
          FROM summaries
          WHERE entity_type = 'budget' AND summary_type = 'pdf-analysis'
          ORDER BY entity_id DESC
        `).all() as { fiscalYear: string; summary: string; metadata: string | null }[];

        // Parse metadata to get PDF URLs
        const summaries = budgetSummaries.map(s => ({
          fiscalYear: s.fiscalYear,
          summary: s.summary,
          pdfUrl: s.metadata ? JSON.parse(s.metadata).pdfUrl : null,
        }));

        return NextResponse.json({ summaries });
      }

      case 'audit-summaries': {
        // Get AI-generated summaries for annual financial reports (audits/ACFRs)
        const db = getDb();

        const auditSummaries = db.prepare(`
          SELECT entity_id as fiscalYear, content as summary, metadata
          FROM summaries
          WHERE entity_type = 'audit' AND summary_type = 'pdf-analysis'
          ORDER BY entity_id DESC
        `).all() as { fiscalYear: string; summary: string; metadata: string | null }[];

        // Parse metadata to get PDF URLs
        const summaries = auditSummaries.map(s => ({
          fiscalYear: s.fiscalYear,
          summary: s.summary,
          pdfUrl: s.metadata ? JSON.parse(s.metadata).pdfUrl : null,
          title: s.metadata ? JSON.parse(s.metadata).title : null,
        }));

        return NextResponse.json({ summaries });
      }

      case 'civic-documents': {
        // Get AI-generated summaries for civic documents (SPLOST, Public Notices, Strategic Plans, Water Quality)
        const db = getDb();
        const docType = searchParams.get('docType'); // Optional filter by type
        const summaryLevel = searchParams.get('summaryLevel'); // Optional: 'headline', 'brief', 'detailed'

        const validDocTypes = ['splost', 'notice', 'strategic', 'water-quality'];
        let rawDocuments: {
          type: string;
          id: string;
          summary: string;
          metadata: string | null;
        }[];

        if (docType && validDocTypes.includes(docType)) {
          // Use parameterized query for single doc type
          rawDocuments = db.prepare(`
            SELECT entity_type as type, entity_id as id, content as summary, metadata
            FROM summaries
            WHERE entity_type = ? AND summary_type = 'pdf-analysis'
            ORDER BY entity_type, entity_id DESC
          `).all(docType) as typeof rawDocuments;
        } else {
          // Query all doc types
          rawDocuments = db.prepare(`
            SELECT entity_type as type, entity_id as id, content as summary, metadata
            FROM summaries
            WHERE entity_type IN ('splost', 'notice', 'strategic', 'water-quality')
              AND summary_type = 'pdf-analysis'
            ORDER BY entity_type, entity_id DESC
          `).all() as typeof rawDocuments;
        }

        // Parse metadata and include all summary levels
        const documents = rawDocuments.map(d => {
          const meta = d.metadata ? JSON.parse(d.metadata) : {};
          const summaryLevels = getAllSummaryLevels(d.type, d.id);

          // Use detailed from pdf-analysis if not separately stored
          if (!summaryLevels.detailed) {
            summaryLevels.detailed = d.summary;
          }

          // Determine which summary to show based on summaryLevel param
          let displaySummary = summaryLevels.detailed || d.summary;
          if (summaryLevel === 'headline' && summaryLevels.headline) {
            displaySummary = summaryLevels.headline;
          } else if (summaryLevel === 'brief' && summaryLevels.brief) {
            displaySummary = summaryLevels.brief;
          }

          return {
            type: d.type,
            id: d.id,
            title: meta.title || d.id,
            summary: displaySummary,
            summaryLevels: {
              headline: summaryLevels.headline || null,
              brief: summaryLevels.brief || null,
              detailed: summaryLevels.detailed || d.summary,
            },
            pdfUrl: meta.pdfUrl || null,
            date: meta.date || null,
          };
        });

        // Group by type for easier frontend consumption
        const grouped = {
          splost: documents.filter(d => d.type === 'splost'),
          notice: documents.filter(d => d.type === 'notice'),
          strategic: documents.filter(d => d.type === 'strategic'),
          'water-quality': documents.filter(d => d.type === 'water-quality'),
        };

        return NextResponse.json({
          documents,
          grouped,
          counts: {
            splost: grouped.splost.length,
            notice: grouped.notice.length,
            strategic: grouped.strategic.length,
            'water-quality': grouped['water-quality'].length,
            total: documents.length,
          },
        });
      }

      case 'ordinances': {
        const status = searchParams.get('status') || undefined;
        const limit = searchParams.get('limit')
          ? parseInt(searchParams.get('limit')!)
          : 20;
        const ordinances = getOrdinances({ status, limit });
        return NextResponse.json({ ordinances });
      }

      case 'pending-ordinances': {
        const pendingOrdinances = getPendingOrdinancesWithProgress();
        return NextResponse.json({ ordinances: pendingOrdinances });
      }

      case 'resolutions': {
        const year = searchParams.get('year') || undefined;
        const limit = searchParams.get('limit')
          ? parseInt(searchParams.get('limit')!)
          : 100;
        const resolutions = getResolutions({ year, limit });
        return NextResponse.json({ resolutions });
      }

      case 'ordinance-meetings': {
        const ordinanceId = searchParams.get('ordinanceId');
        const meetingId = searchParams.get('meetingId');

        if (ordinanceId) {
          const meetings = getMeetingsForOrdinance(ordinanceId);
          return NextResponse.json({ meetings });
        }

        if (meetingId) {
          const ordinances = getOrdinancesForMeeting(meetingId);
          return NextResponse.json({ ordinances });
        }

        return NextResponse.json(
          { error: 'Either ordinanceId or meetingId is required' },
          { status: 400 }
        );
      }

      case 'resolution-meetings': {
        const meetingId = searchParams.get('meetingId');
        if (!meetingId) {
          return NextResponse.json(
            { error: 'meetingId is required' },
            { status: 400 }
          );
        }

        const db = getDb();
        const resolutions = db.prepare(`
          SELECT id, number, title, status, summary, adopted_date
          FROM resolutions
          WHERE meeting_id = ?
          ORDER BY number DESC
        `).all(meetingId) as Array<{
          id: string;
          number: string;
          title: string;
          status: string;
          summary: string | null;
          adopted_date: string | null;
        }>;

        return NextResponse.json({ resolutions });
      }

      case 'activity': {
        const limit = searchParams.get('limit')
          ? parseInt(searchParams.get('limit')!)
          : 20;
        const activity = getRecentActivity(limit);
        return NextResponse.json({ activity });
      }

      case 'timeline': {
        const dateRange = searchParams.get('dateRange') || 'quarter';
        const itemType = searchParams.get('itemType'); // 'meeting', 'ordinance', 'document', or null for all
        const includeUpcoming = searchParams.get('includeUpcoming') !== 'false';

        // Today's date for past/future filtering
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        // Calculate date cutoff based on dateRange
        let cutoffDate: Date;
        switch (dateRange) {
          case 'month':
            cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'quarter':
            cutoffDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            break;
          case 'year':
            cutoffDate = new Date(now.getFullYear(), 0, 1);
            break;
          case 'all':
          default:
            cutoffDate = new Date(2000, 0, 1); // Far in the past
        }
        const cutoffStr = cutoffDate.toISOString().split('T')[0];

        const db = getDb();
        const items: Array<{
          id: string;
          type: 'meeting' | 'ordinance' | 'document';
          date: string;
          title: string;
          description: string | null;
          fullDescription?: string | null;
          link: string;
          metadata?: {
            meetingType?: string;
            ordinanceNumber?: string;
            documentType?: string;
            agendaCount?: number;
            agendaPreview?: string;
            agendaUrl?: string;
            minutesUrl?: string;
            municodeUrl?: string;
            pdfUrl?: string;
          };
        }> = [];

        // Fetch upcoming meetings (next 3 future meetings)
        let upcoming: Array<{
          id: string;
          date: string;
          title: string;
          type: string;
          agendaCount: number;
        }> = [];

        if (includeUpcoming) {
          upcoming = db.prepare(`
            SELECT m.id, m.date, m.title, m.type,
              (SELECT COUNT(*) FROM agenda_items WHERE meeting_id = m.id) as agendaCount
            FROM meetings m
            WHERE m.date > ?
            ORDER BY m.date ASC
            LIMIT 3
          `).all(today) as typeof upcoming;
        }

        // Fetch past meetings WITH content (has agenda items or summary)
        if (!itemType || itemType === 'meeting') {
          const meetings = db.prepare(`
            SELECT m.id, m.date, m.title, m.type, m.summary, m.agenda_url, m.minutes_url,
              (SELECT COUNT(*) FROM agenda_items WHERE meeting_id = m.id) as agenda_count,
              (SELECT GROUP_CONCAT(title, ' | ') FROM (
                SELECT title FROM agenda_items WHERE meeting_id = m.id AND title NOT LIKE '%Call to Order%' AND title NOT LIKE '%Invocation%' AND title NOT LIKE '%Pledge%' AND title NOT LIKE '%Approval of Agenda%' AND title NOT LIKE '%Approval of Minutes%' LIMIT 3
              )) as agenda_preview
            FROM meetings m
            WHERE m.date >= ? AND m.date <= ?
              AND (m.summary IS NOT NULL OR EXISTS (
                SELECT 1 FROM agenda_items WHERE meeting_id = m.id
              ))
            ORDER BY m.date DESC
          `).all(cutoffStr, today) as Array<{
            id: string;
            date: string;
            title: string;
            type: string;
            summary: string | null;
            agenda_url: string | null;
            minutes_url: string | null;
            agenda_count: number;
            agenda_preview: string | null;
          }>;

          for (const m of meetings) {
            // Build description from summary or agenda preview
            let description: string | null = null;
            if (m.summary) {
              description = m.summary.substring(0, 200) + (m.summary.length > 200 ? '...' : '');
            } else if (m.agenda_count > 0) {
              description = `${m.agenda_count} agenda items`;
              if (m.agenda_preview) {
                description += `: ${m.agenda_preview.substring(0, 150)}${m.agenda_preview.length > 150 ? '...' : ''}`;
              }
            }

            items.push({
              id: m.id,
              type: 'meeting',
              date: m.date,
              title: m.title,
              description,
              link: '/meetings',
              metadata: {
                meetingType: m.type,
                agendaCount: m.agenda_count,
                agendaPreview: m.agenda_preview || undefined,
                agendaUrl: m.agenda_url || undefined,
                minutesUrl: m.minutes_url || undefined,
              },
            });
          }
        }

        // Fetch ordinances
        if (!itemType || itemType === 'ordinance') {
          const ordinances = db.prepare(`
            SELECT id, number, title, description, summary, adopted_date, municode_url
            FROM ordinances
            WHERE adopted_date >= ?
            ORDER BY adopted_date DESC
          `).all(cutoffStr) as Array<{
            id: string;
            number: string;
            title: string;
            description: string | null;
            summary: string | null;
            adopted_date: string;
            municode_url: string | null;
          }>;

          for (const o of ordinances) {
            const desc = o.summary || o.description;
            items.push({
              id: o.id,
              type: 'ordinance',
              date: o.adopted_date,
              title: o.title,
              description: desc ? desc.substring(0, 200) + (desc.length > 200 ? '...' : '') : null,
              fullDescription: o.summary || o.description || null,
              link: '/ordinances',
              metadata: {
                ordinanceNumber: o.number,
                municodeUrl: o.municode_url || undefined,
              },
            });
          }
        }

        // Fetch civic documents (from summaries table)
        if (!itemType || itemType === 'document') {
          const documents = db.prepare(`
            SELECT entity_type, entity_id, content, metadata
            FROM summaries
            WHERE entity_type IN ('splost', 'notice', 'strategic', 'water-quality')
              AND summary_type = 'pdf-analysis'
          `).all() as Array<{
            entity_type: string;
            entity_id: string;
            content: string;
            metadata: string | null;
          }>;

          for (const d of documents) {
            const meta = d.metadata ? JSON.parse(d.metadata) : {};
            const docDate = meta.date || null;

            // Skip documents without valid dates
            if (!docDate) continue;

            // Normalize date format (year-only → YYYY-01-01, month → YYYY-MM-01)
            const normalizedDate = docDate.length === 4 ? `${docDate}-01-01`
              : docDate.length === 7 ? `${docDate}-01`
              : docDate;

            // Validate the date is parseable
            if (isNaN(new Date(normalizedDate).getTime())) continue;

            // Skip if before cutoff
            if (normalizedDate < cutoffStr) continue;

            items.push({
              id: d.entity_id,
              type: 'document',
              date: normalizedDate,
              title: meta.title || d.entity_id,
              description: d.content ? d.content.substring(0, 200) + (d.content.length > 200 ? '...' : '') : null,
              fullDescription: d.content || null,
              link: '/documents',
              metadata: {
                documentType: d.entity_type,
                pdfUrl: meta.pdfUrl || undefined,
              },
            });
          }
        }

        // Sort all items by date descending
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json({ items, upcoming });
      }

      default:
        return NextResponse.json({ error: 'Invalid data type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Data error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Data retrieval failed' },
      { status: 500 }
    );
  }
}
