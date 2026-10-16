import Database from 'better-sqlite3';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { queryNextUpcomingMeeting } from '@/lib/cityUpdates';

// A meeting's status ('upcoming'/'past') is only recomputed when the scraper
// re-captures it. If the city moves or cancels a meeting, CivicClerk deletes
// the event and it is never re-captured, so a row can stay frozen at
// status='upcoming' with a date now in the past. That stranded row must never
// be surfaced as the next meeting (this is exactly what put a phantom "COMING
// UP THIS THURSDAY, July 16" on the homepage after the July 2026 meeting moved
// from Thu 7/16 to Wed 7/15).

function seedDb(rows: Array<{ id: string; date: string; status: string }>) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE meetings (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      title TEXT,
      type TEXT,
      status TEXT NOT NULL,
      agenda_url TEXT,
      agenda_summary TEXT
    );
  `);
  const insert = db.prepare(
    "INSERT INTO meetings (id, date, title, type, status) VALUES (?, ?, 'City Council Meeting', 'city_council', ?)"
  );
  for (const r of rows) insert.run(r.id, r.date, r.status);
  return db;
}

describe('queryNextUpcomingMeeting', () => {
  it('skips a past-dated meeting still flagged upcoming', () => {
    const db = seedDb([
      { id: 'civicclerk-59', date: '2026-07-16', status: 'upcoming' }, // stranded phantom
      { id: 'civicclerk-48', date: '2026-08-06', status: 'upcoming' }, // real next meeting
    ]);

    const next = queryNextUpcomingMeeting(db, '2026-07-17');

    expect(next?.id).toBe('civicclerk-48');
  });

  it('returns the soonest genuinely-future upcoming meeting', () => {
    const db = seedDb([
      { id: 'later', date: '2026-09-03', status: 'upcoming' },
      { id: 'sooner', date: '2026-08-06', status: 'upcoming' },
    ]);

    expect(queryNextUpcomingMeeting(db, '2026-07-17')?.id).toBe('sooner');
  });

  it('still includes a meeting happening today', () => {
    const db = seedDb([{ id: 'today', date: '2026-07-17', status: 'upcoming' }]);

    expect(queryNextUpcomingMeeting(db, '2026-07-17')?.id).toBe('today');
  });

  it('returns undefined when every upcoming meeting is in the past', () => {
    const db = seedDb([{ id: 'civicclerk-59', date: '2026-07-16', status: 'upcoming' }]);

    expect(queryNextUpcomingMeeting(db, '2026-07-17')).toBeUndefined();
  });
});

// The homepage calls queryNextUpcomingMeeting with no date, so the default is
// what readers see. These are the instants that showed November 5 as "coming
// up" while the October 15, 2026 meeting was still in session.
describe('queryNextUpcomingMeeting default today', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  };

  const october = () =>
    seedDb([
      { id: 'civicclerk-86', date: '2026-10-15', status: 'upcoming' },
      { id: 'civicclerk-281', date: '2026-10-17', status: 'upcoming' },
    ]);

  it("keeps tonight's meeting at 23:30 EDT", () => {
    at('2026-10-16T03:30:00Z');
    expect(queryNextUpcomingMeeting(october())?.id).toBe('civicclerk-86');
  });

  it("keeps tonight's meeting at 00:30 UTC (20:30 EDT)", () => {
    at('2026-10-16T00:30:00Z');
    expect(queryNextUpcomingMeeting(october())?.id).toBe('civicclerk-86');
  });

  it('moves to the next meeting once the Eastern day is over', () => {
    at('2026-10-16T04:30:00Z');
    expect(queryNextUpcomingMeeting(october())?.id).toBe('civicclerk-281');
  });

  it("keeps a November meeting through 23:30 EST, after daylight saving ends", () => {
    at('2026-11-06T04:30:00Z');
    const db = seedDb([
      { id: 'nov-5', date: '2026-11-05', status: 'upcoming' },
      { id: 'nov-19', date: '2026-11-19', status: 'upcoming' },
    ]);
    expect(queryNextUpcomingMeeting(db)?.id).toBe('nov-5');
  });
});
