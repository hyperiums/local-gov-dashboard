import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'flowery-branch.db');

// Database row types (snake_case matching SQLite columns)
export interface MeetingRow {
  id: string;
  date: string;
  title: string;
  type: string;
  location: string | null;
  agenda_url: string | null;
  minutes_url: string | null;
  packet_url: string | null;
  status: string;
  summary: string | null;
  agenda_summary: string | null;
  minutes_summary: string | null;
  raw_html: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityRow {
  type: string;
  id: string;
  name: string;
  activity_date: string;
  created_at: string;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  const database = db!;

  database.exec(`
    -- Meetings table
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'city_council',
      location TEXT,
      agenda_url TEXT,
      minutes_url TEXT,
      packet_url TEXT,
      status TEXT NOT NULL DEFAULT 'upcoming',
      summary TEXT,
      agenda_summary TEXT,
      minutes_summary TEXT,
      raw_html TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Agenda items table
    CREATE TABLE IF NOT EXISTS agenda_items (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      order_num INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'other',
      reference_number TEXT,
      outcome TEXT,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id)
    );

    -- Attachments table
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'pdf',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES agenda_items(id)
    );

    -- Permits table
    CREATE TABLE IF NOT EXISTS permits (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      type TEXT,
      address TEXT,
      description TEXT,
      value REAL,
      source_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Ordinances table
    CREATE TABLE IF NOT EXISTS ordinances (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'proposed',
      introduced_date TEXT,
      adopted_date TEXT,
      municode_url TEXT,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Ordinance-Meeting junction table
    CREATE TABLE IF NOT EXISTS ordinance_meetings (
      ordinance_id TEXT NOT NULL,
      meeting_id TEXT NOT NULL,
      action TEXT,
      PRIMARY KEY (ordinance_id, meeting_id),
      FOREIGN KEY (ordinance_id) REFERENCES ordinances(id),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id)
    );

    -- Resolutions table
    CREATE TABLE IF NOT EXISTS resolutions (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending_minutes',
      introduced_date TEXT,
      adopted_date TEXT,
      meeting_id TEXT,
      packet_url TEXT,
      summary TEXT,
      outcome_verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id)
    );

    -- Summaries cache table (for AI-generated content)
    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      summary_type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entity_type, entity_id, summary_type)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
    CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
    CREATE INDEX IF NOT EXISTS idx_agenda_items_meeting ON agenda_items(meeting_id);
    CREATE INDEX IF NOT EXISTS idx_permits_month ON permits(month);
    CREATE INDEX IF NOT EXISTS idx_ordinances_number ON ordinances(number);
    CREATE INDEX IF NOT EXISTS idx_resolutions_number ON resolutions(number);
    CREATE INDEX IF NOT EXISTS idx_summaries_entity ON summaries(entity_type, entity_id);
  `);

  // Migrations for existing databases
  // Add metadata column to summaries table if it doesn't exist
  try {
    database.exec(`ALTER TABLE summaries ADD COLUMN metadata TEXT`);
  } catch {
    // Column already exists, ignore error
  }

  // Add agenda_summary and minutes_summary columns to meetings table if they don't exist
  try {
    database.exec(`ALTER TABLE meetings ADD COLUMN agenda_summary TEXT`);
  } catch {
    // Column already exists, ignore error
  }
  try {
    database.exec(`ALTER TABLE meetings ADD COLUMN minutes_summary TEXT`);
  } catch {
    // Column already exists, ignore error
  }

  // Add outcome_verified column to resolutions table if it doesn't exist
  try {
    database.exec(`ALTER TABLE resolutions ADD COLUMN outcome_verified INTEGER DEFAULT 0`);
  } catch {
    // Column already exists, ignore error
  }
}

// Meeting operations
export function insertMeeting(meeting: {
  id: string;
  date: string;
  title: string;
  type?: string;
  location?: string;
  agendaUrl?: string;
  minutesUrl?: string;
  packetUrl?: string;
  status?: string;
  rawHtml?: string;
}) {
  const db = getDb();
  // Use ON CONFLICT to update fields but PRESERVE agenda_summary and minutes_summary
  // This prevents rescraping a meeting from wiping out AI-generated summaries
  const stmt = db.prepare(`
    INSERT INTO meetings (id, date, title, type, location, agenda_url, minutes_url, packet_url, status, raw_html, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date,
      title = excluded.title,
      type = excluded.type,
      location = excluded.location,
      agenda_url = excluded.agenda_url,
      minutes_url = excluded.minutes_url,
      packet_url = excluded.packet_url,
      status = excluded.status,
      raw_html = excluded.raw_html,
      updated_at = datetime('now')
  `);
  stmt.run(
    meeting.id,
    meeting.date,
    meeting.title,
    meeting.type || 'city_council',
    meeting.location || '',
    meeting.agendaUrl || null,
    meeting.minutesUrl || null,
    meeting.packetUrl || null,
    meeting.status || 'upcoming',
    meeting.rawHtml || null
  );
}

export function getMeetings(options?: { status?: string; limit?: number; offset?: number; includeEmpty?: boolean }): MeetingRow[] {
  const db = getDb();
  let query = 'SELECT * FROM meetings m';
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // By default, only show meetings with agenda items or summaries
  if (!options?.includeEmpty) {
    conditions.push('(m.summary IS NOT NULL OR EXISTS (SELECT 1 FROM agenda_items WHERE meeting_id = m.id))');
  }

  if (options?.status) {
    conditions.push('m.status = ?');
    params.push(options.status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY m.date DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  if (options?.offset) {
    query += ' OFFSET ?';
    params.push(options.offset);
  }

  return db.prepare(query).all(...params) as MeetingRow[];
}

export function getMeetingById(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
}

// Agenda item operations
export function insertAgendaItem(item: {
  id: string;
  meetingId: string;
  orderNum: number;
  title: string;
  description?: string;
  type?: string;
  referenceNumber?: string;
  outcome?: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO agenda_items (id, meeting_id, order_num, title, description, type, reference_number, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    item.id,
    item.meetingId,
    item.orderNum,
    item.title,
    item.description || null,
    item.type || 'other',
    item.referenceNumber || null,
    item.outcome || null
  );
}

export function getAgendaItemsByMeeting(meetingId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM agenda_items WHERE meeting_id = ? ORDER BY order_num').all(meetingId);
}

// Permit operations
export function insertPermit(permit: {
  id: string;
  month: string;
  type?: string;
  address?: string;
  description?: string;
  value?: number;
  sourceUrl: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO permits (id, month, type, address, description, value, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    permit.id,
    permit.month,
    permit.type || null,
    permit.address || null,
    permit.description || null,
    permit.value || null,
    permit.sourceUrl
  );
}

export function getPermitsByMonth(month: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM permits WHERE month = ?').all(month);
}

export function getPermitStats(startMonth: string, endMonth: string) {
  const db = getDb();
  return db.prepare(`
    SELECT month, COUNT(*) as count, SUM(value) as total_value
    FROM permits
    WHERE month >= ? AND month <= ?
    GROUP BY month
    ORDER BY month DESC
  `).all(startMonth, endMonth);
}

export function getAllPermits(options?: { limit?: number }) {
  const db = getDb();
  let query = 'SELECT * FROM permits ORDER BY month DESC, created_at DESC';
  if (options?.limit) {
    query += ` LIMIT ${options.limit}`;
  }
  return db.prepare(query).all();
}

export function getPermitSummaryStats() {
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) as count FROM permits').get() as { count: number };
  const totalValue = db.prepare('SELECT SUM(value) as total FROM permits').get() as { total: number | null };

  const byType = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM permits
    WHERE type IS NOT NULL
    GROUP BY type
  `).all() as { type: string; count: number }[];

  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonth = db.prepare('SELECT COUNT(*) as count FROM permits WHERE month = ?').get(currentMonth) as { count: number };

  return {
    total: total.count,
    totalValue: totalValue.total || 0,
    thisMonth: thisMonth.count,
    byType: byType.reduce((acc, row) => {
      acc[row.type] = row.count;
      return acc;
    }, {} as Record<string, number>),
  };
}

// Ordinance operations
export function insertOrdinance(ordinance: {
  id: string;
  number: string;
  title: string;
  description?: string;
  summary?: string;
  status?: string;
  introducedDate?: string;
  adoptedDate?: string;
  municodeUrl?: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ordinances (id, number, title, description, summary, status, introduced_date, adopted_date, municode_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(
    ordinance.id,
    ordinance.number,
    ordinance.title,
    ordinance.description || null,
    ordinance.summary || null,
    ordinance.status || 'proposed',
    ordinance.introducedDate || null,
    ordinance.adoptedDate || null,
    ordinance.municodeUrl || null
  );
}

// Update ordinance summary
export function updateOrdinanceSummary(id: string, summary: string) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE ordinances SET summary = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(summary, id);
}

// Update resolution summary
export function updateResolutionSummary(id: string, summary: string) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE resolutions SET summary = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(summary, id);
}

// Update meeting summary (legacy - updates the general summary column)
export function updateMeetingSummary(id: string, summary: string) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE meetings SET summary = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(summary, id);
}

// Update meeting agenda summary
export function updateMeetingAgendaSummary(id: string, summary: string) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE meetings SET agenda_summary = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(summary, id);
}

// Update meeting minutes summary
export function updateMeetingMinutesSummary(id: string, summary: string) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE meetings SET minutes_summary = ?, updated_at = datetime('now') WHERE id = ?
  `);
  stmt.run(summary, id);
}

export function getOrdinances(options?: { status?: string; limit?: number }) {
  const db = getDb();
  let query = 'SELECT * FROM ordinances';
  const params: (string | number)[] = [];

  if (options?.status) {
    query += ' WHERE status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY CAST(number AS INTEGER) DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  return db.prepare(query).all(...params);
}

// Summary operations
export function saveSummary(
  entityType: string,
  entityId: string,
  summaryType: string,
  content: string,
  metadata?: Record<string, unknown>
) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO summaries (id, entity_type, entity_id, summary_type, content, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const id = `${entityType}-${entityId}-${summaryType}`;
  stmt.run(id, entityType, entityId, summaryType, content, metadata ? JSON.stringify(metadata) : null);
}

export function updateSummaryMetadata(
  entityType: string,
  entityId: string,
  summaryType: string,
  metadataUpdates: Record<string, unknown>
) {
  const db = getDb();
  const id = `${entityType}-${entityId}-${summaryType}`;

  // Get existing metadata
  const existing = db.prepare(`
    SELECT metadata FROM summaries WHERE id = ?
  `).get(id) as { metadata: string | null } | undefined;

  const currentMetadata = existing?.metadata ? JSON.parse(existing.metadata) : {};
  const updatedMetadata = { ...currentMetadata, ...metadataUpdates };

  db.prepare(`
    UPDATE summaries SET metadata = ? WHERE id = ?
  `).run(JSON.stringify(updatedMetadata), id);
}

export function getSummary(entityType: string, entityId: string, summaryType?: string) {
  const db = getDb();
  if (summaryType) {
    return db.prepare(`
      SELECT content, summary_type FROM summaries
      WHERE entity_type = ? AND entity_id = ? AND summary_type = ?
    `).get(entityType, entityId, summaryType) as { content: string; summary_type: string } | undefined;
  }
  // If no summaryType specified, return the detailed/pdf-analysis version
  return db.prepare(`
    SELECT content, summary_type FROM summaries
    WHERE entity_type = ? AND entity_id = ? AND summary_type IN ('detailed', 'pdf-analysis')
    ORDER BY CASE summary_type WHEN 'detailed' THEN 1 ELSE 2 END
    LIMIT 1
  `).get(entityType, entityId) as { content: string; summary_type: string } | undefined;
}

// Get all summary levels for an entity
export interface SummaryLevels {
  headline?: string;
  brief?: string;
  detailed?: string;
}

export function getAllSummaryLevels(entityType: string, entityId: string): SummaryLevels {
  const db = getDb();
  const rows = db.prepare(`
    SELECT summary_type, content FROM summaries
    WHERE entity_type = ? AND entity_id = ?
      AND summary_type IN ('headline', 'brief', 'detailed', 'pdf-analysis')
  `).all(entityType, entityId) as { summary_type: string; content: string }[];

  const result: SummaryLevels = {};
  for (const row of rows) {
    if (row.summary_type === 'headline') {
      result.headline = row.content;
    } else if (row.summary_type === 'brief') {
      result.brief = row.content;
    } else if (row.summary_type === 'detailed' || row.summary_type === 'pdf-analysis') {
      // Prefer 'detailed' over 'pdf-analysis' if both exist
      if (!result.detailed || row.summary_type === 'detailed') {
        result.detailed = row.content;
      }
    }
  }

  return result;
}

// Parse permit count from AI-generated summaries
// Summaries contain text like "A total of 25 permits were issued this month"
export function getPermitCountFromSummaries(): number {
  const db = getDb();
  const summaries = db.prepare(`
    SELECT content FROM summaries
    WHERE entity_type = 'permit' AND summary_type = 'pdf-analysis'
  `).all() as { content: string }[];

  let total = 0;
  const regex = /(\d+)\s+permits?\s+were\s+issued/i;

  for (const { content } of summaries) {
    const match = content.match(regex);
    if (match) {
      total += parseInt(match[1], 10);
    }
  }

  return total;
}

// Parse business count from AI-generated summaries
// Summaries end with "5 new businesses registered this month."
export function getBusinessCountFromSummaries(): number {
  const db = getDb();
  const summaries = db.prepare(`
    SELECT content FROM summaries
    WHERE entity_type = 'business' AND summary_type = 'pdf-analysis'
  `).all() as { content: string }[];

  let total = 0;
  const regex = /\[?(\d+)\]?\s+new\s+businesses?\s+registered/i;

  for (const { content } of summaries) {
    const match = content.match(regex);
    if (match) {
      total += parseInt(match[1], 10);
    }
  }

  return total;
}

// Ordinance-Meeting relationship queries
export interface OrdinanceMeetingRow {
  ordinance_id: string;
  meeting_id: string;
  action: string | null;
}

export interface MeetingWithAction extends MeetingRow {
  action: string | null;
}

export interface OrdinanceRow {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  introduced_date: string | null;
  adopted_date: string | null;
  municode_url: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrdinanceWithAction extends OrdinanceRow {
  action: string | null;
}

export interface ResolutionRow {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  introduced_date: string | null;
  adopted_date: string | null;
  meeting_id: string | null;
  packet_url: string | null;
  summary: string | null;
  outcome_verified: number;
  created_at: string;
  updated_at: string;
}

// Resolution operations
export function insertResolution(resolution: {
  id: string;
  number: string;
  title: string;
  description?: string;
  status?: string;
  introducedDate?: string;
  adoptedDate?: string;
  meetingId?: string;
  packetUrl?: string;
  summary?: string;
  outcomeVerified?: boolean;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO resolutions (id, number, title, description, status, introduced_date, adopted_date, meeting_id, packet_url, summary, outcome_verified, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(
    resolution.id,
    resolution.number,
    resolution.title,
    resolution.description || null,
    resolution.status || 'pending_minutes',
    resolution.introducedDate || null,
    resolution.adoptedDate || null,
    resolution.meetingId || null,
    resolution.packetUrl || null,
    resolution.summary || null,
    resolution.outcomeVerified ? 1 : 0
  );
}

// Update resolution status and mark as verified from minutes
export function updateResolutionOutcome(
  id: string,
  status: 'adopted' | 'rejected' | 'tabled',
  adoptedDate?: string
) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE resolutions
    SET status = ?, outcome_verified = 1, adopted_date = COALESCE(?, adopted_date), updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(status, adoptedDate || null, id);
}

export function getResolutions(options?: { year?: string; limit?: number }): ResolutionRow[] {
  const db = getDb();
  let query = 'SELECT * FROM resolutions';
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (options?.year) {
    conditions.push("number LIKE ?");
    params.push(`${options.year.slice(-2)}-%`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY number DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  return db.prepare(query).all(...params) as ResolutionRow[];
}

export function getResolutionByNumber(number: string): ResolutionRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM resolutions WHERE number = ?').get(number) as ResolutionRow | undefined;
}

export function getMeetingsForOrdinance(ordinanceId: string): MeetingWithAction[] {
  const db = getDb();
  return db.prepare(`
    SELECT m.*, om.action
    FROM meetings m
    JOIN ordinance_meetings om ON m.id = om.meeting_id
    WHERE om.ordinance_id = ?
    ORDER BY m.date ASC
  `).all(ordinanceId) as MeetingWithAction[];
}

export function getOrdinancesForMeeting(meetingId: string): OrdinanceWithAction[] {
  const db = getDb();
  return db.prepare(`
    SELECT o.*, om.action
    FROM ordinances o
    JOIN ordinance_meetings om ON o.id = om.ordinance_id
    WHERE om.meeting_id = ?
    ORDER BY CAST(o.number AS INTEGER) DESC
  `).all(meetingId) as OrdinanceWithAction[];
}

// Insert or update an ordinance-meeting relationship
export function insertOrdinanceMeeting(
  ordinanceId: string,
  meetingId: string,
  action?: string
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO ordinance_meetings (ordinance_id, meeting_id, action)
    VALUES (?, ?, ?)
  `).run(ordinanceId, meetingId, action || 'discussed');
}

// Get ordinance by its number (e.g., "2024-001")
export function getOrdinanceByNumber(ordinanceNumber: string): OrdinanceRow | null {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM ordinances WHERE number = ?
  `).get(ordinanceNumber) as OrdinanceRow | null;
}

// Get all agenda items that reference ordinances
export function getAgendaItemsWithOrdinances(): Array<{
  meeting_id: string;
  title: string;
  reference_number: string | null;
}> {
  const db = getDb();
  return db.prepare(`
    SELECT meeting_id, title, reference_number
    FROM agenda_items
    WHERE type = 'ordinance' OR title LIKE '%ordinance%'
  `).all() as Array<{
    meeting_id: string;
    title: string;
    reference_number: string | null;
  }>;
}

// Dashboard queries
export function getDashboardStats() {
  const db = getDb();

  const meetingCount = db.prepare('SELECT COUNT(*) as count FROM meetings').get() as { count: number };
  const upcomingMeetings = db.prepare("SELECT COUNT(*) as count FROM meetings WHERE status = 'upcoming'").get() as { count: number };
  const ordinanceCount = db.prepare('SELECT COUNT(*) as count FROM ordinances').get() as { count: number };

  // Get counts from AI summaries instead of empty tables
  const businessCount = getBusinessCountFromSummaries();
  const permitCount = getPermitCountFromSummaries();

  return {
    totalMeetings: meetingCount.count,
    upcomingMeetings: upcomingMeetings.count,
    totalOrdinances: ordinanceCount.count,
    recentBusinesses: businessCount,
    recentPermits: permitCount,
  };
}

export function getRecentActivity(limit: number = 20): ActivityRow[] {
  const db = getDb();

  // Combine meetings with development summaries (AI-generated monthly reports)
  const activities = db.prepare(`
    SELECT 'meeting' as type, id, title as name, date as activity_date, created_at
    FROM meetings
    UNION ALL
    SELECT
      CASE entity_type
        WHEN 'permit' THEN 'permit-report'
        WHEN 'business' THEN 'business-report'
        ELSE 'report'
      END as type,
      entity_id as id,
      CASE entity_type
        WHEN 'permit' THEN 'Monthly Permit Report'
        WHEN 'business' THEN 'New Business Report'
        ELSE 'Development Report'
      END as name,
      entity_id as activity_date,
      created_at
    FROM summaries
    WHERE entity_type IN ('permit', 'business') AND summary_type = 'pdf-analysis'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as ActivityRow[];

  return activities;
}
