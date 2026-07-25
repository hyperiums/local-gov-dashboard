// An applicant can withdraw an item, or council can simply stop bringing it
// back, and neither leaves a vote behind for the pipeline to read. Without a
// cutoff those items sit on the page as live legislation indefinitely.
// Lives here rather than in db.ts so client components can read it without
// pulling the SQLite driver into the browser bundle.
export const DORMANT_AFTER_DAYS = 60;

// 'scheduled' means an agenda put this reading on a meeting but no vote is on
// record for it — either the minutes are not published yet, or the item never
// actually came up. Distinguishing it from 'completed' keeps the site from
// asserting a reading happened when the city's record only shows it was
// calendared: four ordinances withdrawn before their hearing still had their
// scheduled first reading rendered as a completed one.
export type TimelineStepStatus = 'completed' | 'scheduled' | 'current' | 'upcoming';
// 'considered' covers a meeting the ordinance came before that maps to none of
// the named stages. Action vocabularies differ between councils, so the
// timeline needs a neutral entry rather than silently dropping the meeting.
export type TimelineAction =
  | 'first_reading'
  | 'public_hearing'
  | 'second_reading'
  | 'adopted'
  | 'tabled'
  | 'denied'
  | 'considered'
  | 'withdrawn';

// Standard ordinance process steps
export const STANDARD_ORDINANCE_STEPS = [
  { action: 'first_reading', label: 'First Reading' },
  { action: 'second_reading', label: 'Second Reading' },
  { action: 'adopted', label: 'Adopted' },
] as const;

// All possible actions with their display labels
export const ACTION_LABELS: Record<string, string> = {
  'first_reading': 'First Reading',
  'public_hearing': 'Public Hearing',
  'second_reading': 'Second Reading',
  'adopted': 'Adopted',
  'tabled': 'Tabled',
  'denied': 'Denied',
  'rejected': 'Rejected',
  'discussed': 'Discussed',
  'amended': 'Amended',
  'introduced': 'Introduced',
  'considered': 'Considered',
  'withdrawn': 'Withdrawn',
};

/**
 * Normalize action string to our standard format
 * Handles common variants like 'first_reading_passed' -> 'first_reading'
 */
export function normalizeAction(action: string | null): string {
  if (!action) return 'discussed';
  let normalized = action.toLowerCase().replace(/\s+/g, '_');

  // Normalize common variants to canonical form
  if (normalized === 'first_reading_passed') normalized = 'first_reading';

  return ACTION_LABELS[normalized] ? normalized : 'discussed';
}

export interface TimelineStep {
  action: TimelineAction;
  label: string;
  status: TimelineStepStatus;
  date: string | null;
  meetingId: string | null;
  meetingTitle?: string;
}

// Data returned from the API for ordinance lifecycle
export interface OrdinanceLifecycleReading {
  action: string;
  meeting_id: string;
  meeting_date: string;
  meeting_title: string;
  /** 1 when a recorded council vote confirmed this action, 0 when it is only what the agenda scheduled. */
  outcome_verified?: number;
}

// Props for the OrdinanceLifecycleTimeline component
export interface OrdinanceLifecycleTimelineProps {
  /** Pre-loaded readings array (for pending ordinances that already have this data) */
  readings?: OrdinanceLifecycleReading[];
  /** Ordinance ID to fetch lifecycle data (for adopted ordinances) */
  ordinanceId?: string;
  /** Show expected upcoming steps for pending ordinances */
  showExpectedSteps?: boolean;
  /**
   * The ordinance's adoption is confirmed by a source other than a council
   * vote record — Municode publication, typically. Meetings before roughly
   * September 2025 carry no motions/votes data at all, so without this an
   * ordinance the city has long since codified would render every step as
   * merely "scheduled".
   */
  adoptionConfirmed?: boolean;
  /** Layout variant */
  variant?: 'horizontal' | 'vertical' | 'auto';
  /** Compact mode for smaller spaces */
  compact?: boolean;
}
