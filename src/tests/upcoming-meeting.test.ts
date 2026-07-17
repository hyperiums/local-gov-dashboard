import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
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
