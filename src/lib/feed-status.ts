import type { ScrapeRunRow } from './db';

// Why this module exists: a collector that silently reaches nothing looks
// exactly like one with nothing new to collect. Both leave the newest row
// untouched. Telling them apart needs the collector's own account of its
// last run — what it attempted, what it reached, what it took in — so the
// status line reports collection rather than inferring it from row counts.

export type FeedState =
  | 'ok'
  | 'awaiting_publication'
  | 'overdue'
  | 'blocked'
  | 'parser_broken'
  | 'not_checking'
  | 'never_run';

export type FeedLevel = 'ok' | 'info' | 'warn' | 'error';

export interface FeedStatusInput {
  latestRun: ScrapeRunRow | null;
  latestSuccessfulRun: ScrapeRunRow | null;
  newestMonthHeld: string | null;
  now: Date;
  /** A run older than this means the schedule itself stopped firing. */
  maxRunAgeDays?: number;
  /** How long a published-monthly source may lag before absence is a fault. */
  graceDays?: number;
}

export interface FeedStatus {
  state: FeedState;
  level: FeedLevel;
  headline: string;
  detail: string;
  /** When rows last actually arrived — not merely when a run last finished. */
  lastCollectedAt: string | null;
  lastCheckedAt: string | null;
  newestMonthHeld: string | null;
  /** Newest month whose listing should exist by now. */
  expectedMonth: string;
  /** Oldest month we do not hold — where a gap starts. */
  oldestMissingMonth: string | null;
}

const DEFAULT_MAX_RUN_AGE_DAYS = 14;
const DEFAULT_GRACE_DAYS = 45;
const DAY_MS = 86_400_000;

function monthKey(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;
}

/** The month before `now` — a monthly report covering month M appears during M+1. */
function previousMonth(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return m === 0 ? monthKey(y - 1, 11) : monthKey(y, m - 1);
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? monthKey(y + 1, 0) : monthKey(y, m);
}

/** Midnight UTC on the first day after `month` ends. */
function monthEnd(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

// SQLite datetime('now') writes "YYYY-MM-DD HH:MM:SS" in UTC with no zone
// marker; Date would read that as local time and drift by the offset.
function parseSqliteUtc(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

function ageInDays(timestamp: string, now: Date): number {
  return daysBetween(parseSqliteUtc(timestamp), now);
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`;
}

export function deriveFeedStatus(inputs: FeedStatusInput): FeedStatus {
  const {
    latestRun,
    latestSuccessfulRun,
    newestMonthHeld,
    now,
    maxRunAgeDays = DEFAULT_MAX_RUN_AGE_DAYS,
    graceDays = DEFAULT_GRACE_DAYS,
  } = inputs;

  const expectedMonth = previousMonth(now);
  const oldestMissingMonth = newestMonthHeld ? nextMonth(newestMonthHeld) : null;
  const base = {
    lastCollectedAt: latestSuccessfulRun?.ran_at ?? null,
    lastCheckedAt: latestRun?.ran_at ?? null,
    newestMonthHeld,
    expectedMonth,
    oldestMissingMonth,
  };

  if (!latestRun) {
    return {
      ...base,
      state: 'never_run',
      level: 'warn',
      headline: 'Permit collection has never run',
      detail:
        'No collection run has been recorded, so any permit data shown here is of unknown age.',
    };
  }

  const runAge = ageInDays(latestRun.ran_at, now);

  // Checked before the run's own outcome: a stalled schedule means the last
  // recorded outcome describes a moment that has since gone unwatched, so a
  // stored "ok" says nothing about now.
  if (runAge > maxRunAgeDays) {
    return {
      ...base,
      state: 'not_checking',
      level: 'error',
      headline: `Permit collection has not run in ${Math.floor(runAge)} days`,
      detail:
        `The last attempt was ${latestRun.ran_at} UTC. Collection is expected to run at ` +
        `least every ${maxRunAgeDays} days, so the schedule itself has likely stopped.`,
    };
  }

  if (latestRun.outcome === 'unreachable') {
    return {
      ...base,
      state: 'blocked',
      level: 'error',
      headline: 'Permit collection cannot reach the city\'s document host',
      detail:
        `The last run (${latestRun.ran_at} UTC) failed to fetch any monthly listing. ` +
        'This is a fetch failure, not an absence of published permits — figures below ' +
        'are as of the last successful collection.',
    };
  }

  if (latestRun.outcome === 'parsed_empty') {
    return {
      ...base,
      state: 'parser_broken',
      level: 'error',
      headline: 'Permit listings downloaded but none could be read',
      detail:
        `The last run (${latestRun.ran_at} UTC) fetched at least one monthly listing but ` +
        'extracted no records from it, which usually means the report layout changed.',
    };
  }

  // Absence beyond this point is the source's pace, not a fetch failure.
  if (!newestMonthHeld) {
    return {
      ...base,
      state: 'overdue',
      level: 'warn',
      headline: 'No permit data has been collected',
      detail: 'Collection is running and reaching the source, but no month has produced records.',
    };
  }

  if (newestMonthHeld >= expectedMonth) {
    return {
      ...base,
      state: 'ok',
      level: 'ok',
      headline: `Permit data current through ${formatMonth(newestMonthHeld)}`,
      detail:
        `Last collected ${base.lastCollectedAt ?? 'unknown'} UTC. ` +
        `${formatMonth(expectedMonth)} is the newest listing the city is expected to have published.`,
    };
  }

  // Grace runs from the end of the oldest month we're missing, so a widening
  // gap trips the warning even while the newest expected month is still young.
  const missing = oldestMissingMonth!;
  const missingAge = daysBetween(monthEnd(missing), now);

  if (missingAge > graceDays) {
    return {
      ...base,
      state: 'overdue',
      level: 'warn',
      headline: `${formatMonth(missing)} permit listing is ${Math.floor(missingAge)} days overdue`,
      detail:
        `Collection is running and reaching the city's site, but no listing for ` +
        `${formatMonth(missing)} has appeared. The city may have moved or renamed the report.`,
    };
  }

  return {
    ...base,
    state: 'awaiting_publication',
    level: 'info',
    headline: `Permit data current through ${formatMonth(newestMonthHeld)}`,
    detail:
      `The ${formatMonth(missing)} listing has not been published yet. Collection last ran ` +
      `${latestRun.ran_at} UTC and confirmed it is not yet available.`,
  };
}
