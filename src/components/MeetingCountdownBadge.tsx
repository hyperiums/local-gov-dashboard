'use client';

import { useState, useEffect } from 'react';
import { daysUntil, todayInCityTimezone } from '@/lib/dates';

// Counted from the city's calendar day, not the reader's, so someone reading
// from another time zone sees the same TODAY/TOMORROW as the server that chose
// this meeting.
function getMeetingCountdown(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const meetingDate = new Date(year, month - 1, day);
  const diffDays = daysUntil(dateStr, todayInCityTimezone());

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

export function MeetingCountdownBadge({ dateStr }: { dateStr: string }) {
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    setCountdown(getMeetingCountdown(dateStr));
  }, [dateStr]);

  if (!countdown) return null;

  const isUrgent = countdown === 'TODAY' || countdown === 'TOMORROW';

  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
      isUrgent ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
    }`}>
      {countdown}
    </span>
  );
}
