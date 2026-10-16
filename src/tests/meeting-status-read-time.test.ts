import Database from 'better-sqlite3';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { queryMeetings, countUpcomingMeetings, withDateStatus } from '@/lib/db';
import {
  queryNextUpcomingMeeting,
  queryRecentPastMeetings,
  queryLastPastMeetingDate,
} from '@/lib/cityUpdates';
import { queryMeetingList } from '@/lib/meeting-list';
import { isMeetingStatus, meetingStatusOn } from '@/lib/dates';

// meetings.status is stamped only when a scrape re-captures a meeting (Wed and
// Sat 06:00 UTC). On Friday, October 16, 2026, production still stored the
// October 15 meeting as 'upcoming', so /meetings labelled it Upcoming and the
// one-upcoming fallback never surfaced the October 17 special called meeting.
// Rows for events the city deleted (civicclerk-254/270/255/271) stay
// 'upcoming' with past dates forever. Readers judge status from the date.

interface Seed {
  id: string;
  date: string;
  status: 'upcoming' | 'past';
  agendaItems: number;
  summary?: string;
}

function seedDb(rows: Seed[]) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE meetings (
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
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE agenda_items (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      title TEXT NOT NULL
    );
  `);
  const insertMeeting = db.prepare(
    "INSERT INTO meetings (id, date, title, status, summary) VALUES (?, ?, 'City Council Meeting', ?, ?)"
  );
  const insertItem = db.prepare('INSERT INTO agenda_items (id, meeting_id, title) VALUES (?, ?, ?)');
  for (const row of rows) {
    insertMeeting.run(row.id, row.date, row.status, row.summary);
    for (let n = 1; n <= row.agendaItems; n++) {
      insertItem.run(`${row.id}-item-${n}`, row.id, `Item ${n}`);
    }
  }
  return db;
}

const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

// 10:00 EDT on Friday, before Saturday's 06:00 UTC scrape re-stamps anything.
const FRIDAY_MORNING = '2026-10-16T14:00:00Z';

const ids = (rows: Array<{ id: string }>) => rows.map(row => row.id);
const statusById = (rows: Array<{ id: string; status: string }>) =>
  Object.fromEntries(rows.map(row => [row.id, row.status]));

afterEach(() => {
  vi.useRealTimers();
});

describe('meeting status helpers', () => {
  it('judges a date against the given city day', () => {
    expect(meetingStatusOn('2026-10-15', '2026-10-16')).toBe('past');
    expect(meetingStatusOn('2026-10-16', '2026-10-16')).toBe('upcoming');
    expect(meetingStatusOn('2026-10-17', '2026-10-16')).toBe('upcoming');
  });

  it('accepts only upcoming and past as a status filter', () => {
    expect(isMeetingStatus('upcoming')).toBe(true);
    expect(isMeetingStatus('past')).toBe(true);
    expect(isMeetingStatus('all')).toBe(false);
    expect(isMeetingStatus('')).toBe(false);
  });

  it('overwrites a stale stored status without mutating the row', () => {
    const stored = { id: 'civicclerk-86', date: '2026-10-15', status: 'upcoming' };
    const derived = withDateStatus(stored, '2026-10-16');
    expect(derived.status).toBe('past');
    expect(stored.status).toBe('upcoming');
  });
});

describe('Friday after the October 15 meeting, before the Saturday scrape', () => {
  const friday = () =>
    seedDb([
      { id: 'civicclerk-86', date: '2026-10-15', status: 'upcoming', agendaItems: 3 },
      { id: 'civicclerk-281', date: '2026-10-17', status: 'upcoming', agendaItems: 0 },
      { id: 'civicclerk-63', date: '2026-11-05', status: 'upcoming', agendaItems: 0 },
      { id: 'civicclerk-254', date: '2026-08-20', status: 'upcoming', agendaItems: 0 },
    ]);

  it('the All list labels October 15 past and leads with the October 17 meeting', () => {
    at(FRIDAY_MORNING);
    const list = queryMeetingList(friday(), {});
    expect(ids(list)).toEqual(['civicclerk-281', 'civicclerk-86']);
    expect(statusById(list)).toEqual({ 'civicclerk-281': 'upcoming', 'civicclerk-86': 'past' });
  });

  it('the Upcoming tab shows only the October 17 meeting', () => {
    at(FRIDAY_MORNING);
    const list = queryMeetingList(friday(), { status: 'upcoming' });
    expect(ids(list)).toEqual(['civicclerk-281']);
    expect(list[0].status).toBe('upcoming');
  });

  it('the Past tab holds the October 15 meeting', () => {
    at(FRIDAY_MORNING);
    const list = queryMeetingList(friday(), { status: 'past' });
    expect(ids(list)).toEqual(['civicclerk-86']);
    expect(list[0].status).toBe('past');
  });

  it('home Coming Up is the October 17 meeting', () => {
    at(FRIDAY_MORNING);
    const next = queryNextUpcomingMeeting(friday());
    expect(next?.id).toBe('civicclerk-281');
    expect(next?.status).toBe('upcoming');
  });

  it('the dashboard counts only meetings dated today or later', () => {
    at(FRIDAY_MORNING);
    expect(countUpcomingMeetings(friday())).toBe(2);
  });

  it('recent decisions and "Data through" read October 15 as the latest past meeting', () => {
    at(FRIDAY_MORNING);
    const db = friday();
    expect(ids(queryRecentPastMeetings(db, 3))).toEqual(['civicclerk-86']);
    expect(queryLastPastMeetingDate(db)).toBe('2026-10-15');
  });
});

// The old status = 'past' filter happened to keep CivicClerk-deleted events out
// of Recent Decisions; judging by date alone let those empty rows fill its three
// slots. Only meetings with agenda items or a summary count as decisions.
describe('Recent Decisions and "Data through" with deleted-event rows', () => {
  it('skip an empty row that shares a date with a real meeting', () => {
    at(FRIDAY_MORNING);
    const db = seedDb([
      { id: 'civicclerk-86', date: '2026-10-15', status: 'upcoming', agendaItems: 3 },
      { id: 'civicclerk-281', date: '2026-10-17', status: 'upcoming', agendaItems: 0 },
      { id: 'civicclerk-255', date: '2026-10-01', status: 'upcoming', agendaItems: 0 },
      { id: 'oct-1-with-agenda', date: '2026-10-01', status: 'past', agendaItems: 1 },
      { id: 'civicclerk-254', date: '2026-09-03', status: 'upcoming', agendaItems: 0 },
      { id: 'aug-20-summary-only', date: '2026-08-20', status: 'past', agendaItems: 0, summary: 'Approved the budget.' },
    ]);
    expect(ids(queryRecentPastMeetings(db, 3))).toEqual([
      'civicclerk-86',
      'oct-1-with-agenda',
      'aug-20-summary-only',
    ]);
  });

  it('never date "Data through" from an empty later-dated past row', () => {
    at(FRIDAY_MORNING);
    const db = seedDb([
      { id: 'civicclerk-271', date: '2026-10-15', status: 'upcoming', agendaItems: 0 },
      { id: 'oct-1-with-agenda', date: '2026-10-01', status: 'past', agendaItems: 2 },
    ]);
    expect(queryLastPastMeetingDate(db)).toBe('2026-10-01');
  });
});

describe('a stored upcoming row with a past date', () => {
  const stale = () =>
    seedDb([
      { id: 'civicclerk-254', date: '2026-08-20', status: 'upcoming', agendaItems: 0 },
      { id: 'stale-with-agenda', date: '2026-09-03', status: 'upcoming', agendaItems: 2 },
      { id: 'civicclerk-63', date: '2026-11-05', status: 'upcoming', agendaItems: 0 },
    ]);

  it('is never listed as upcoming', () => {
    at(FRIDAY_MORNING);
    const db = stale();
    expect(ids(queryMeetingList(db, { status: 'upcoming' }))).toEqual(['civicclerk-63']);
    expect(ids(queryMeetings(db, { status: 'upcoming', includeEmpty: true }))).toEqual(['civicclerk-63']);
  });

  it('is labelled past wherever it is listed', () => {
    at(FRIDAY_MORNING);
    const db = stale();
    const list = queryMeetingList(db, {});
    expect(ids(list)).toEqual(['civicclerk-63', 'stale-with-agenda']);
    expect(statusById(list)['stale-with-agenda']).toBe('past');
    expect(statusById(queryMeetings(db, { includeEmpty: true }))['civicclerk-254']).toBe('past');
  });

  it('is never the next meeting', () => {
    at(FRIDAY_MORNING);
    expect(queryNextUpcomingMeeting(stale())?.id).toBe('civicclerk-63');
  });
});

describe('a meeting dated today', () => {
  it('stays upcoming at 23:30 EDT on its own day', () => {
    at('2026-10-16T03:30:00Z');
    const db = seedDb([
      { id: 'civicclerk-86', date: '2026-10-15', status: 'upcoming', agendaItems: 3 },
      { id: 'civicclerk-281', date: '2026-10-17', status: 'upcoming', agendaItems: 0 },
    ]);
    const list = queryMeetingList(db, { status: 'upcoming' });
    expect(ids(list)).toEqual(['civicclerk-86']);
    expect(list[0].status).toBe('upcoming');
  });

  it('is upcoming even when an older scrape stamped it past', () => {
    at(FRIDAY_MORNING);
    const db = seedDb([
      { id: 'early-stamp', date: '2026-10-16', status: 'past', agendaItems: 1 },
      { id: 'civicclerk-63', date: '2026-11-05', status: 'upcoming', agendaItems: 0 },
    ]);
    const upcoming = queryMeetingList(db, { status: 'upcoming' });
    expect(ids(upcoming)).toEqual(['early-stamp']);
    expect(upcoming[0].status).toBe('upcoming');
    expect(queryMeetingList(db, { status: 'past' })).toEqual([]);
    expect(queryNextUpcomingMeeting(db)?.id).toBe('early-stamp');
  });
});
