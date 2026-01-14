import { getDb, type MeetingRow, type OrdinanceRow } from './db';

// Types for the City Updates feature
export interface UpcomingMeeting {
  id: string;
  date: string;
  title: string;
  type: string;
  agendaCount: number;
  publicHearings: string[];
  agendaUrl: string | null;
  agendaTopics: string[];
}

export interface PendingLegislation {
  id: string;
  type: 'ordinance' | 'resolution';
  number: string;
  title: string;
  summary: string | null;
  meetingDate: string;
  status: 'first_reading' | 'second_reading' | 'pending';
  nextMeetingDate?: string;
}

export interface RecentDecision {
  meetingId: string;
  meetingDate: string;
  meetingTitle: string;
  decision: string;
  type: 'ordinance' | 'budget' | 'resolution' | 'other';
  ordinanceNumber?: string;
  ordinanceId?: string;
  municodeUrl?: string;
  resolutionNumber?: string;
}

export interface MonthlyStats {
  month: string;
  monthLabel: string;
  permits: number;
  businesses: number;
}

export interface FreshnessInfo {
  lastMeetingDate: string | null;
  lastDataUpdate: string | null;
  nextMeetingDate: string | null;
}

export interface CityUpdatesData {
  nextMeeting: UpcomingMeeting | null;
  pendingLegislation: PendingLegislation[];
  recentDecisions: RecentDecision[];
  monthlyStats: MonthlyStats | null;
  freshness: FreshnessInfo;
}

// Parse date string as local date to avoid timezone issues
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Get human-friendly countdown for upcoming meeting
export function getMeetingCountdown(dateStr: string): string {
  const meetingDate = parseLocalDate(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Reset to start of day for comparison

  const diffTime = meetingDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'TOMORROW';
  if (diffDays <= 7) {
    const dayName = meetingDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    return `THIS ${dayName}`;
  }
  if (diffDays <= 14) {
    const dayName = meetingDate.toLocaleDateString('en-US', { weekday: 'long' });
    return `Next ${dayName}`;
  }
  return meetingDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// Parse agenda topics from agenda_summary field
function parseAgendaTopics(agendaSummary: string | null): string[] {
  if (!agendaSummary) return [];

  // Look for "Topics on the Agenda" section and extract bullet points
  const topicsMatch = agendaSummary.match(/\*\*Topics on the Agenda\*\*\s*([\s\S]*?)(?=\*\*|$)/i);
  if (!topicsMatch) return [];

  const topicsSection = topicsMatch[1];
  // Extract bullet points (lines starting with • or -)
  const bullets = topicsSection.match(/[•\-]\s*(.+)/g);
  if (!bullets) return [];

  return bullets
    .map(b => b.replace(/^[•\-]\s*/, '').trim())
    .filter(b => b.length > 0)
    .slice(0, 4); // Limit to 4 topics
}

// Get the next upcoming meeting with agenda details
function getNextMeeting(): UpcomingMeeting | null {
  const db = getDb();

  // Get the next upcoming meeting (sorted by date ASC to get the closest one)
  const meeting = db.prepare(`
    SELECT * FROM meetings
    WHERE status = 'upcoming'
    ORDER BY date ASC
    LIMIT 1
  `).get() as (MeetingRow & { agenda_summary: string | null }) | undefined;

  if (!meeting) return null;

  // Get agenda item count
  const agendaCount = db.prepare(`
    SELECT COUNT(*) as count FROM agenda_items WHERE meeting_id = ?
  `).get(meeting.id) as { count: number };

  // Try to identify public hearings from agenda items
  const publicHearingItems = db.prepare(`
    SELECT title FROM agenda_items
    WHERE meeting_id = ?
    AND (title LIKE '%public hearing%' OR title LIKE '%Public Hearing%')
  `).all(meeting.id) as { title: string }[];

  // Parse agenda topics from the summary
  const agendaTopics = parseAgendaTopics(meeting.agenda_summary);

  return {
    id: meeting.id,
    date: meeting.date,
    title: meeting.title,
    type: meeting.type,
    agendaCount: agendaCount.count,
    publicHearings: publicHearingItems.map(item => item.title),
    agendaUrl: meeting.agenda_url,
    agendaTopics,
  };
}

// Get recent decisions from past meetings
function getRecentDecisions(limit: number = 5): RecentDecision[] {
  const db = getDb();
  const decisions: RecentDecision[] = [];

  // Get recent past meetings with summaries
  const recentMeetings = db.prepare(`
    SELECT id, date, title, summary
    FROM meetings
    WHERE status = 'past'
    ORDER BY date DESC
    LIMIT 3
  `).all() as (MeetingRow & { summary: string | null })[];

  // Get recently adopted ordinances (last 60 days)
  const recentOrdinances = db.prepare(`
    SELECT o.id, o.number, o.title, o.adopted_date, o.summary, o.municode_url,
           om.meeting_id
    FROM ordinances o
    LEFT JOIN ordinance_meetings om ON o.id = om.ordinance_id AND om.action = 'adopted'
    WHERE o.adopted_date IS NOT NULL
      AND o.adopted_date >= date('now', '-60 days')
    ORDER BY o.adopted_date DESC
    LIMIT 3
  `).all() as Array<OrdinanceRow & { meeting_id: string | null }>;

  // Add ordinance adoptions as decisions
  for (const ord of recentOrdinances) {
    // Get a brief description - first sentence of summary or title
    let decision = `Adopted - ${ord.title}`;
    if (ord.summary) {
      // Extract "What it does:" section if present
      const whatItDoesMatch = ord.summary.match(/\*\*What it does\*\*:?\s*([^*\n]+)/i);
      if (whatItDoesMatch) {
        decision = whatItDoesMatch[1].trim();
      } else {
        // Take first sentence
        const firstSentence = ord.summary.split(/[.!?]/)[0];
        if (firstSentence && firstSentence.length < 150) {
          decision = firstSentence.trim();
        }
      }
    }

    decisions.push({
      meetingId: ord.meeting_id || '',
      meetingDate: ord.adopted_date || '',
      meetingTitle: 'City Council',
      decision,
      type: 'ordinance',
      ordinanceNumber: ord.number,
      ordinanceId: ord.id,
      municodeUrl: ord.municode_url || undefined,
    });
  }

  // Look for resolutions and budget items in agenda items from recent meetings
  for (const meeting of recentMeetings) {
    const significantItems = db.prepare(`
      SELECT title, outcome, reference_number, type as item_type FROM agenda_items
      WHERE meeting_id = ?
      AND (
        title LIKE '%resolution%'
        OR title LIKE '%budget%'
        OR title LIKE '%contract%'
        OR type = 'resolution'
        OR outcome IS NOT NULL
      )
      LIMIT 2
    `).all(meeting.id) as { title: string; outcome: string | null; reference_number: string | null; item_type: string | null }[];

    for (const item of significantItems) {
      // Skip if we already have enough decisions
      if (decisions.length >= limit) break;

      // Determine type
      let type: RecentDecision['type'] = 'other';
      if (item.item_type === 'resolution' || item.title.toLowerCase().includes('resolution')) type = 'resolution';
      else if (item.title.toLowerCase().includes('budget')) type = 'budget';

      // Clean up title
      let decision = item.title
        .replace(/^consider\s+/i, '')
        .replace(/^approval of\s+/i, '')
        .replace(/^approve\s+/i, '');

      if (item.outcome) {
        decision += ` - ${item.outcome}`;
      }

      // Avoid duplicates (ordinances already added)
      const isDuplicate = decisions.some(d =>
        d.meetingDate === meeting.date && d.decision.includes(decision.substring(0, 30))
      );

      if (!isDuplicate) {
        decisions.push({
          meetingId: meeting.id,
          meetingDate: meeting.date,
          meetingTitle: meeting.title,
          decision,
          type,
          resolutionNumber: type === 'resolution' ? item.reference_number || undefined : undefined,
        });
      }
    }
  }

  // Sort by date descending and limit
  return decisions
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))
    .slice(0, limit);
}

// Get monthly development stats
function getMonthlyStats(): MonthlyStats | null {
  const db = getDb();

  // Get the most recent month that has summaries
  const latestPermitSummary = db.prepare(`
    SELECT entity_id as month, content FROM summaries
    WHERE entity_type = 'permit' AND summary_type = 'pdf-analysis'
    ORDER BY entity_id DESC
    LIMIT 1
  `).get() as { month: string; content: string } | undefined;

  const latestBusinessSummary = db.prepare(`
    SELECT entity_id as month, content FROM summaries
    WHERE entity_type = 'business' AND summary_type = 'pdf-analysis'
    ORDER BY entity_id DESC
    LIMIT 1
  `).get() as { month: string; content: string } | undefined;

  if (!latestPermitSummary && !latestBusinessSummary) return null;

  // Use the most recent month between permits and businesses
  const month = latestPermitSummary?.month || latestBusinessSummary?.month || '';

  // Parse permit count from summary
  let permits = 0;
  if (latestPermitSummary?.content) {
    const match = latestPermitSummary.content.match(/(\d+)\s+permits?\s+were\s+issued/i);
    if (match) permits = parseInt(match[1], 10);
  }

  // Parse business count from summary
  let businesses = 0;
  if (latestBusinessSummary?.content) {
    const match = latestBusinessSummary.content.match(/\[?(\d+)\]?\s+new\s+businesses?\s+registered/i);
    if (match) businesses = parseInt(match[1], 10);
  }

  // Format month label
  const [year, monthNum] = month.split('-');
  const monthDate = new Date(parseInt(year), parseInt(monthNum) - 1);
  const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return {
    month,
    monthLabel,
    permits,
    businesses,
  };
}

// Get data freshness information
function getFreshnessInfo(): FreshnessInfo {
  const db = getDb();

  const lastMeeting = db.prepare(`
    SELECT MAX(date) as date FROM meetings WHERE status = 'past'
  `).get() as { date: string | null };

  const nextMeeting = db.prepare(`
    SELECT MIN(date) as date FROM meetings WHERE status = 'upcoming'
  `).get() as { date: string | null };

  const lastUpdate = db.prepare(`
    SELECT MAX(created_at) as updated FROM summaries
  `).get() as { updated: string | null };

  return {
    lastMeetingDate: lastMeeting.date,
    lastDataUpdate: lastUpdate.updated,
    nextMeetingDate: nextMeeting.date,
  };
}

// Get pending legislation from the upcoming meeting's agenda
function getPendingLegislation(): PendingLegislation[] {
  const db = getDb();
  const legislation: PendingLegislation[] = [];

  // Get ordinances and resolutions from the UPCOMING meeting's agenda
  // This shows what's actually being considered, not past items
  const upcomingItems = db.prepare(`
    SELECT ai.title, ai.type, ai.reference_number, m.date as meeting_date, m.id as meeting_id
    FROM agenda_items ai
    JOIN meetings m ON ai.meeting_id = m.id
    WHERE m.status = 'upcoming'
      AND m.date = (SELECT MIN(date) FROM meetings WHERE status = 'upcoming')
      AND (ai.type IN ('ordinance', 'resolution')
           OR ai.title LIKE '%Ordinance%'
           OR ai.title LIKE '%Resolution%')
    ORDER BY ai.order_num
    LIMIT 6
  `).all() as {
    title: string;
    type: string | null;
    reference_number: string | null;
    meeting_date: string;
    meeting_id: string;
  }[];

  const seen = new Set<string>();
  for (const item of upcomingItems) {
    const isOrdinance = item.type === 'ordinance' || item.title.toLowerCase().includes('ordinance');
    const isResolution = item.type === 'resolution' || item.title.toLowerCase().includes('resolution');

    if (!isOrdinance && !isResolution) continue;

    // Extract number from title
    const numMatch = isOrdinance
      ? item.title.match(/Ordinance\s+(\d+)/i)
      : item.title.match(/Resolution\s+([\d-]+)/i);
    const num = numMatch ? numMatch[1] : item.reference_number || '';

    // Skip duplicates
    const key = `${isOrdinance ? 'ord' : 'res'}-${num}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Determine status from title
    let status: PendingLegislation['status'] = 'pending';
    if (item.title.toLowerCase().includes('first reading')) {
      status = 'first_reading';
    } else if (item.title.toLowerCase().includes('second reading')) {
      status = 'second_reading';
    }

    // Clean up title - remove common prefixes
    let cleanTitle = item.title
      .replace(/^Consider\s+(the\s+)?(First|Second)\s+Reading\s+(of\s+)?/i, '')
      .replace(/^Consider\s+/i, '')
      .replace(/^(Ordinance|Resolution)\s+[\d-]+\s*[-–—]?\s*/i, '')
      .trim();

    // Truncate if too long
    if (cleanTitle.length > 80) {
      cleanTitle = cleanTitle.substring(0, 77) + '...';
    }

    legislation.push({
      id: key,
      type: isOrdinance ? 'ordinance' : 'resolution',
      number: num,
      title: cleanTitle || `${isOrdinance ? 'Ordinance' : 'Resolution'} ${num}`,
      summary: null,
      meetingDate: item.meeting_date,
      status,
    });
  }

  return legislation;
}

// Main function to get all city updates data
export function getCityUpdatesData(): CityUpdatesData {
  return {
    nextMeeting: getNextMeeting(),
    pendingLegislation: getPendingLegislation(),
    recentDecisions: getRecentDecisions(5),
    monthlyStats: getMonthlyStats(),
    freshness: getFreshnessInfo(),
  };
}

// Format date for display with timezone safety
export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', options || {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format relative time (e.g., "2 days ago")
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'recently';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}
