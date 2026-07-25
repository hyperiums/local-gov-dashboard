import { describe, it, expect } from 'vitest';
import { buildTimelineSteps } from '@/components/ordinances/OrdinanceLifecycleTimeline';
import type { OrdinanceLifecycleReading } from '@/components/ordinances/types';

const reading = (
  action: string,
  meeting_date: string,
  outcome_verified = 0
): OrdinanceLifecycleReading => ({
  action,
  meeting_date,
  meeting_id: `meeting-${meeting_date}`,
  meeting_title: 'City Council Meeting',
  outcome_verified,
});

describe('buildTimelineSteps', () => {
  it('places a reading at its standard stage', () => {
    const steps = buildTimelineSteps([reading('first_reading', '2026-06-18', 1)], true);
    const first = steps.find(s => s.action === 'first_reading');
    expect(first).toMatchObject({ date: '2026-06-18', status: 'completed' });
  });

  it('marks a reading with no recorded vote as scheduled rather than completed', () => {
    const steps = buildTimelineSteps([reading('second_reading', '2026-07-15', 0)], true);
    expect(steps.find(s => s.action === 'second_reading')?.status).toBe('scheduled');
  });

  it('treats every step as completed when adoption is confirmed elsewhere', () => {
    // Municode publication confirms adoption for meetings that predate the
    // portal's vote records.
    const steps = buildTimelineSteps(
      [reading('first_reading', '2024-02-01', 0), reading('adopted', '2024-02-15', 0)],
      false,
      true
    );
    expect(steps.every(s => s.status !== 'scheduled')).toBe(true);
  });

  // Councils record plenty of actions that are not one of the standard stages —
  // an item can be amended, continued, introduced, or simply discussed. Dropping
  // those left a real meeting missing from a public timeline: ordinance 239-N was
  // before council on April 16 under a title reading "Consideration of Proposed
  // Amendments…", and the timeline showed only its May 7 adoption.
  it('keeps a meeting whose action is not a standard stage', () => {
    const steps = buildTimelineSteps(
      [reading('amended', '2026-04-16', 0), reading('adopted', '2026-05-07', 1)],
      false
    );
    const considered = steps.find(s => s.date === '2026-04-16');
    expect(considered).toBeTruthy();
    expect(considered?.label).toBe('Considered');
  });

  it('names the stage only where the record does, claiming no particular reading', () => {
    const steps = buildTimelineSteps([reading('discussed', '2026-04-16', 0)], false);
    const considered = steps.find(s => s.date === '2026-04-16');
    expect(considered?.label).toBe('Considered');
    expect(considered?.action).not.toBe('first_reading');
    expect(considered?.action).not.toBe('second_reading');
  });

  it('orders dated steps chronologically', () => {
    const steps = buildTimelineSteps(
      [reading('amended', '2026-04-16'), reading('adopted', '2026-05-07', 1)],
      false
    );
    const dates = steps.map(s => s.date).filter(Boolean) as string[];
    expect([...dates]).toEqual([...dates].sort());
  });

  it('does not duplicate a meeting already shown at a standard stage', () => {
    const steps = buildTimelineSteps(
      [reading('first_reading', '2026-06-18', 1), reading('adopted', '2026-07-15', 1)],
      false
    );
    const onJune18 = steps.filter(s => s.date === '2026-06-18');
    expect(onJune18).toHaveLength(1);
  });

  it('carries the vote confidence of the meeting it came from', () => {
    const verified = buildTimelineSteps([reading('amended', '2026-04-16', 1)], false)
      .find(s => s.date === '2026-04-16');
    const unverified = buildTimelineSteps([reading('amended', '2026-04-16', 0)], false)
      .find(s => s.date === '2026-04-16');
    expect(verified?.status).toBe('completed');
    expect(unverified?.status).toBe('scheduled');
  });
});

describe('withdrawn ordinances', () => {
  it('ends the timeline at the withdrawal rather than waiting on a reading', () => {
    const steps = buildTimelineSteps(
      [reading('first_reading', '2026-05-07', 0), reading('withdrawn', '2026-05-07', 1)],
      true
    );
    expect(steps.some(s => s.action === 'withdrawn')).toBe(true);
    expect(steps.some(s => s.status === 'current')).toBe(false);
  });

  // A withdrawal is not a rejection. The applicant pulled the item; the council
  // never ruled on it, and the page should not imply that it did.
  it('does not report a withdrawn ordinance as adopted or denied', () => {
    const steps = buildTimelineSteps(
      [reading('second_reading', '2026-05-07', 0), reading('withdrawn', '2026-05-07', 1)],
      false
    );
    expect(steps.some(s => s.action === 'adopted')).toBe(false);
    expect(steps.some(s => s.action === 'denied')).toBe(false);
  });
});
