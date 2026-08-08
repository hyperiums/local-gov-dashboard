import { describe, it, expect } from 'vitest';
import { deriveFeedStatus, type FeedStatusInput } from '@/lib/feed-status';
import type { ScrapeRunRow } from '@/lib/db';

// The failure this guards against: the permit collector ran twice a week for
// months, reached nothing, and reported "success". Every assertion here is
// about the status line describing the collector's own last run rather than
// the presence of rows, which looks the same whether a feed is healthy or
// abandoned.

const run = (over: Partial<ScrapeRunRow> = {}): ScrapeRunRow => ({
  id: 1,
  feed: 'permits',
  ran_at: '2026-08-08 06:00:00',
  outcome: 'ok',
  months_attempted: 12,
  months_ingested: 1,
  rows_ingested: 48,
  newest_month_ingested: '2026-06',
  detail: null,
  ...over,
});

const input = (over: Partial<FeedStatusInput> = {}): FeedStatusInput => ({
  latestRun: run(),
  latestSuccessfulRun: run(),
  newestMonthHeld: '2026-06',
  now: new Date('2026-08-08T12:00:00Z'),
  ...over,
});

describe('deriveFeedStatus - never run', () => {
  it('reports never_run rather than implying freshness from existing rows', () => {
    const status = deriveFeedStatus(input({ latestRun: null, latestSuccessfulRun: null }));
    expect(status.state).toBe('never_run');
    expect(status.level).toBe('warn');
    expect(status.lastCollectedAt).toBeNull();
  });
});

describe('deriveFeedStatus - source unreachable', () => {
  // Production's actual condition: the city's PDF host blocks the server's
  // IP, so every month came back a failure and the op still said success.
  const blocked = input({
    latestRun: run({
      outcome: 'unreachable',
      months_ingested: 0,
      rows_ingested: 0,
      newest_month_ingested: null,
      detail: JSON.stringify({ unreachable: 12, notPublished: 0 }),
    }),
  });

  it('is an error, not a quiet pass', () => {
    const status = deriveFeedStatus(blocked);
    expect(status.state).toBe('blocked');
    expect(status.level).toBe('error');
  });

  it('still reports when data last actually arrived', () => {
    const status = deriveFeedStatus(blocked);
    expect(status.lastCollectedAt).toBe('2026-08-08 06:00:00');
  });

  it('outranks an otherwise-current holding', () => {
    // Rows are current, but the collector cannot reach the source. The
    // banner must not read "ok" just because the data looks recent.
    const status = deriveFeedStatus({ ...blocked, newestMonthHeld: '2026-07' });
    expect(status.level).toBe('error');
  });
});

describe('deriveFeedStatus - fetched but parsed nothing', () => {
  it('flags a parser regression instead of counting it as a clean run', () => {
    const status = deriveFeedStatus(input({
      latestRun: run({
        outcome: 'parsed_empty',
        months_ingested: 0,
        rows_ingested: 0,
        newest_month_ingested: null,
      }),
    }));
    expect(status.state).toBe('parser_broken');
    expect(status.level).toBe('error');
  });
});

describe('deriveFeedStatus - awaiting publication', () => {
  // Aug 8: July's listing is genuinely not posted yet. Absence here is the
  // city's pace, not our failure, and the status says so without going red.
  it('does not cry stale while the expected month is still within grace', () => {
    const status = deriveFeedStatus(input({
      latestRun: run({
        outcome: 'ok',
        months_ingested: 0,
        rows_ingested: 0,
        newest_month_ingested: null,
        detail: JSON.stringify({ unreachable: 0, notPublished: 12 }),
      }),
    }));
    expect(status.state).toBe('awaiting_publication');
    expect(status.level).toBe('info');
    expect(status.expectedMonth).toBe('2026-07');
  });

  it('goes overdue once the grace window passes', () => {
    const status = deriveFeedStatus(input({
      now: new Date('2026-09-25T12:00:00Z'),
      latestRun: run({
        ran_at: '2026-09-25 06:00:00',
        outcome: 'ok',
        months_ingested: 0,
        rows_ingested: 0,
        newest_month_ingested: null,
        detail: JSON.stringify({ unreachable: 0, notPublished: 12 }),
      }),
    }));
    expect(status.state).toBe('overdue');
    expect(status.level).toBe('warn');
    expect(status.expectedMonth).toBe('2026-08');
  });
});

describe('deriveFeedStatus - healthy', () => {
  it('is ok when the newest expected listing is already held', () => {
    const status = deriveFeedStatus(input({
      now: new Date('2026-08-08T12:00:00Z'),
      newestMonthHeld: '2026-07',
      latestRun: run({ newest_month_ingested: '2026-07' }),
      latestSuccessfulRun: run({ newest_month_ingested: '2026-07' }),
    }));
    expect(status.state).toBe('ok');
    expect(status.level).toBe('ok');
  });

  it('stays ok on a run that reached the source and found nothing new', () => {
    // Holding June, expecting July, July genuinely unpublished -> the run
    // ingesting zero rows is the correct outcome, not a fault.
    const status = deriveFeedStatus(input({
      latestRun: run({
        months_ingested: 0,
        rows_ingested: 0,
        newest_month_ingested: null,
        detail: JSON.stringify({ unreachable: 0, notPublished: 12 }),
      }),
    }));
    expect(status.level).not.toBe('error');
  });
});

describe('deriveFeedStatus - collector stopped running', () => {
  it('flags a stalled schedule even when the last run succeeded', () => {
    // The cron itself died. Rows look fine; nothing has checked in weeks.
    const status = deriveFeedStatus(input({
      now: new Date('2026-08-08T12:00:00Z'),
      latestRun: run({ ran_at: '2026-06-01 06:00:00' }),
      latestSuccessfulRun: run({ ran_at: '2026-06-01 06:00:00' }),
    }));
    expect(status.state).toBe('not_checking');
    expect(status.level).toBe('error');
  });
});

describe('deriveFeedStatus - expected month arithmetic', () => {
  it('rolls back across a year boundary', () => {
    const status = deriveFeedStatus(input({
      now: new Date('2026-01-20T12:00:00Z'),
      latestRun: run({ ran_at: '2026-01-20 06:00:00' }),
      latestSuccessfulRun: run({ ran_at: '2026-01-20 06:00:00' }),
    }));
    expect(status.expectedMonth).toBe('2025-12');
  });
});
