import { NextResponse } from 'next/server';
import {
  summarizeMeetingAgenda,
  summarizeMeetingMinutes,
  explainOrdinance,
  generateWeeklySummary,
  extractKeyDecisions,
  analyzeOrdinanceImage,
  analyzePdf,
  fetchPdfAsBase64,
} from '@/lib/summarize';
import { getMeetings, getRecentBusinesses, getPermitStats, getOrdinances } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/summarize - Generate AI summaries
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, params } = body;

    switch (type) {
      case 'meeting-agenda': {
        const { meetingId, agendaText } = params || {};
        if (!meetingId || !agendaText) {
          return NextResponse.json(
            { error: 'meetingId and agendaText are required' },
            { status: 400 }
          );
        }

        const summary = await summarizeMeetingAgenda(meetingId, agendaText, {
          forceRefresh: params.forceRefresh,
        });

        return NextResponse.json({ success: true, summary });
      }

      case 'meeting-minutes': {
        const { meetingId, minutesText } = params || {};
        if (!meetingId || !minutesText) {
          return NextResponse.json(
            { error: 'meetingId and minutesText are required' },
            { status: 400 }
          );
        }

        const summary = await summarizeMeetingMinutes(meetingId, minutesText, {
          forceRefresh: params.forceRefresh,
        });

        return NextResponse.json({ success: true, summary });
      }

      case 'ordinance': {
        const { ordinanceId, ordinanceText } = params || {};
        if (!ordinanceId || !ordinanceText) {
          return NextResponse.json(
            { error: 'ordinanceId and ordinanceText are required' },
            { status: 400 }
          );
        }

        const explanation = await explainOrdinance(ordinanceId, ordinanceText, {
          forceRefresh: params.forceRefresh,
        });

        return NextResponse.json({ success: true, explanation });
      }

      case 'weekly': {
        // Generate weekly summary from database data
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Get recent meetings
        const meetings = getMeetings({ limit: 10 }) as {
          id: string;
          title: string;
          date: string;
          summary?: string;
        }[];
        const recentMeetings = meetings.filter(
          m => new Date(m.date) >= weekAgo && new Date(m.date) <= now
        );

        // Get recent businesses
        const businesses = getRecentBusinesses(20) as {
          name: string;
          address?: string;
          created_at: string;
        }[];
        const recentBusinesses = businesses.filter(
          b => new Date(b.created_at) >= weekAgo
        );

        // Get permit stats
        const permitStats = getPermitStats(monthStr, monthStr) as { count: number }[];
        const permitCount = permitStats[0]?.count || 0;

        // Get recent ordinance activity
        const ordinances = getOrdinances({ limit: 5 }) as {
          number: string;
          title: string;
          status: string;
        }[];

        const summary = await generateWeeklySummary(
          {
            meetings: recentMeetings.map(m => ({
              title: m.title,
              date: m.date,
              summary: m.summary,
            })),
            newBusinesses: recentBusinesses.map(b => ({
              name: b.name,
              address: b.address,
            })),
            permitCount,
            ordinances: ordinances.map(o => ({
              number: o.number,
              title: o.title,
              status: o.status,
            })),
          },
          { forceRefresh: params?.forceRefresh }
        );

        return NextResponse.json({ success: true, summary });
      }

      case 'extract-decisions': {
        const { meetingText } = params || {};
        if (!meetingText) {
          return NextResponse.json(
            { error: 'meetingText is required' },
            { status: 400 }
          );
        }

        const decisions = await extractKeyDecisions(meetingText);
        return NextResponse.json({ success: true, decisions });
      }

      case 'ordinance-vision': {
        // Analyze ordinance from images using GPT-4 Vision
        const { ordinanceNumber, images } = params || {};
        if (!ordinanceNumber || !images || !Array.isArray(images) || images.length === 0) {
          return NextResponse.json(
            { error: 'ordinanceNumber and images array (base64 data URLs) are required' },
            { status: 400 }
          );
        }

        // Limit to first 4 pages to manage costs
        const limitedImages = images.slice(0, 4);

        const summary = await analyzeOrdinanceImage(ordinanceNumber, limitedImages, {
          forceRefresh: params.forceRefresh,
        });

        return NextResponse.json({
          success: true,
          summary,
          pagesAnalyzed: limitedImages.length,
          note: limitedImages.length < images.length
            ? `Analyzed first ${limitedImages.length} pages of ${images.length} total`
            : undefined,
        });
      }

      case 'analyze-pdf': {
        // Analyze any PDF document (ordinance, permit, business, meeting)
        const { documentId, documentType = 'general', pdfBase64, pdfUrl } = params || {};
        if (!documentId) {
          return NextResponse.json(
            { error: 'documentId is required' },
            { status: 400 }
          );
        }

        // Validate document type
        const validTypes = ['ordinance', 'permit', 'business', 'meeting', 'general'];
        if (!validTypes.includes(documentType)) {
          return NextResponse.json(
            { error: `documentType must be one of: ${validTypes.join(', ')}` },
            { status: 400 }
          );
        }

        let pdfData = pdfBase64;

        // If URL provided, fetch the PDF
        if (!pdfData && pdfUrl) {
          pdfData = await fetchPdfAsBase64(pdfUrl);
          if (!pdfData) {
            return NextResponse.json(
              { error: 'Failed to fetch PDF from URL' },
              { status: 400 }
            );
          }
        }

        if (!pdfData) {
          return NextResponse.json(
            { error: 'Either pdfBase64 or pdfUrl is required' },
            { status: 400 }
          );
        }

        const summary = await analyzePdf(
          documentId,
          documentType as 'ordinance' | 'permit' | 'business' | 'meeting' | 'general',
          pdfData,
          { forceRefresh: params.forceRefresh }
        );

        return NextResponse.json({
          success: true,
          summary,
          documentType,
          source: pdfUrl ? 'url' : 'upload',
        });
      }

      // Keep legacy endpoint for backwards compatibility
      case 'ordinance-pdf': {
        const { ordinanceNumber, pdfBase64, pdfUrl } = params || {};
        if (!ordinanceNumber) {
          return NextResponse.json(
            { error: 'ordinanceNumber is required' },
            { status: 400 }
          );
        }

        let pdfData = pdfBase64;
        if (!pdfData && pdfUrl) {
          pdfData = await fetchPdfAsBase64(pdfUrl);
          if (!pdfData) {
            return NextResponse.json(
              { error: 'Failed to fetch PDF from URL' },
              { status: 400 }
            );
          }
        }

        if (!pdfData) {
          return NextResponse.json(
            { error: 'Either pdfBase64 or pdfUrl is required' },
            { status: 400 }
          );
        }

        const summary = await analyzePdf(ordinanceNumber, 'ordinance', pdfData, {
          forceRefresh: params.forceRefresh,
        });

        return NextResponse.json({
          success: true,
          summary,
          source: pdfUrl ? 'url' : 'upload',
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid summary type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Summarize error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Summarization failed' },
      { status: 500 }
    );
  }
}
