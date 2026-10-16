import { describe, it, expect } from 'vitest';
import { todayInCityTimezone, getMeetingStatus, daysUntil } from '@/lib/dates';

// Production runs in a UTC container. From 8 PM Eastern (7 PM in winter) the
// UTC date is already tomorrow, which marked the October 15, 2026 meeting past
// and put November 5 on the homepage while the council was still in session.
// Every instant below is written in UTC so the test means the same thing on
// any machine.

describe('todayInCityTimezone', () => {
  it('is still the meeting day at 23:30 EDT', () => {
    expect(todayInCityTimezone(new Date('2026-10-16T03:30:00Z'))).toBe('2026-10-15');
  });

  it('is still the meeting day at 00:30 UTC (20:30 EDT)', () => {
    expect(todayInCityTimezone(new Date('2026-10-16T00:30:00Z'))).toBe('2026-10-15');
  });

  it('turns over at Eastern midnight, not UTC midnight', () => {
    expect(todayInCityTimezone(new Date('2026-10-16T04:30:00Z'))).toBe('2026-10-16');
  });

  it('uses EST after daylight saving ends (November)', () => {
    expect(todayInCityTimezone(new Date('2026-11-06T04:30:00Z'))).toBe('2026-11-05'); // 23:30 EST
    expect(todayInCityTimezone(new Date('2026-11-06T04:59:00Z'))).toBe('2026-11-05'); // 23:59 EST; under EDT this would be Nov 6
    expect(todayInCityTimezone(new Date('2026-11-06T05:30:00Z'))).toBe('2026-11-06'); // 00:30 EST
  });

  it('crosses the November 1, 2026 fall-back night correctly', () => {
    expect(todayInCityTimezone(new Date('2026-11-01T03:30:00Z'))).toBe('2026-10-31'); // 23:30 EDT
    expect(todayInCityTimezone(new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01'); // 01:30 EDT
  });
});

describe('getMeetingStatus', () => {
  it('keeps a meeting upcoming through 23:30 EDT on its own day', () => {
    expect(getMeetingStatus('2026-10-15', new Date('2026-10-16T03:30:00Z'))).toBe('upcoming');
  });

  it('keeps a meeting upcoming at 00:30 UTC on meeting night', () => {
    expect(getMeetingStatus('2026-10-15', new Date('2026-10-16T00:30:00Z'))).toBe('upcoming');
  });

  it('marks it past once the Eastern day is over', () => {
    expect(getMeetingStatus('2026-10-15', new Date('2026-10-16T04:30:00Z'))).toBe('past');
  });

  it('keeps a November (EST) meeting upcoming through 23:30 EST', () => {
    expect(getMeetingStatus('2026-11-05', new Date('2026-11-06T04:30:00Z'))).toBe('upcoming');
    expect(getMeetingStatus('2026-11-05', new Date('2026-11-06T05:30:00Z'))).toBe('past');
  });

  it('keeps a Saturday meeting upcoming when the 06:00 UTC cron scrapes it that morning', () => {
    // Event 281, the October 17, 2026 special called meeting; the cron runs at 02:00 EDT.
    expect(getMeetingStatus('2026-10-17', new Date('2026-10-17T06:00:00Z'))).toBe('upcoming');
  });

  it('marks an earlier day past', () => {
    expect(getMeetingStatus('2026-10-14', new Date('2026-10-15T12:00:00Z'))).toBe('past');
  });
});

describe('daysUntil', () => {
  it('counts whole calendar days', () => {
    expect(daysUntil('2026-10-15', '2026-10-15')).toBe(0);
    expect(daysUntil('2026-10-17', '2026-10-15')).toBe(2);
    expect(daysUntil('2026-10-15', '2026-10-16')).toBe(-1);
  });

  it('is not thrown off by the daylight-saving change in between', () => {
    expect(daysUntil('2026-11-05', '2026-10-29')).toBe(7);
  });
});
