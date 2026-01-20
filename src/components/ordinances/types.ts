export type TimelineStepStatus = 'completed' | 'current' | 'upcoming';
export type TimelineAction = 'first_reading' | 'public_hearing' | 'second_reading' | 'adopted' | 'tabled' | 'denied';

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
}

// Props for the OrdinanceLifecycleTimeline component
export interface OrdinanceLifecycleTimelineProps {
  /** Pre-loaded readings array (for pending ordinances that already have this data) */
  readings?: OrdinanceLifecycleReading[];
  /** Ordinance ID to fetch lifecycle data (for adopted ordinances) */
  ordinanceId?: string;
  /** Show expected upcoming steps for pending ordinances */
  showExpectedSteps?: boolean;
  /** Layout variant */
  variant?: 'horizontal' | 'vertical' | 'auto';
  /** Compact mode for smaller spaces */
  compact?: boolean;
}
