import type Database from 'better-sqlite3';
import { queryMeetings, type MeetingRow } from './db';
import { queryNextUpcomingMeeting } from './cityUpdates';
import { todayInCityTimezone, type MeetingStatus } from './dates';

/**
 * The /meetings list hides meetings with no agenda items and no summary, which
 * is every meeting the city has only just posted. When nothing listed is
 * upcoming, the next meeting on the calendar goes first anyway, so the
 * Upcoming tab never reads empty while a meeting is scheduled.
 */
export function queryMeetingList(
  db: Database.Database,
  options: { status?: MeetingStatus; limit?: number },
  today: string = todayInCityTimezone()
): MeetingRow[] {
  const meetings = queryMeetings(db, options, today);
  if (options.status === 'past') return meetings;
  if (meetings.some(meeting => meeting.status === 'upcoming')) return meetings;
  const next = queryNextUpcomingMeeting(db, today);
  return next ? [next, ...meetings] : meetings;
}
