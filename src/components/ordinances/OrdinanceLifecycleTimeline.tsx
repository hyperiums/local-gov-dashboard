'use client';

import { useState, useEffect } from 'react';
import { TimelineStep } from './TimelineStep';
import {
  ACTION_LABELS,
  normalizeAction,
  type TimelineStep as TimelineStepType,
  type OrdinanceLifecycleTimelineProps,
  type OrdinanceLifecycleReading,
  type TimelineStepStatus,
} from './types';

/**
 * Build timeline steps from readings data
 * Handles both pending (with showExpectedSteps) and adopted ordinances
 */
function buildTimelineSteps(
  readings: OrdinanceLifecycleReading[],
  showExpectedSteps: boolean
): TimelineStepType[] {
  // Create a map of completed actions with their meeting info
  const completedActions = new Map<string, OrdinanceLifecycleReading>();
  for (const reading of readings) {
    const action = normalizeActionKey(reading.action);
    // Keep the earliest occurrence for each action type
    if (!completedActions.has(action)) {
      completedActions.set(action, reading);
    }
  }

  // Check for terminal states
  const hasDenied = completedActions.has('denied') || completedActions.has('rejected');
  const hasTabled = completedActions.has('tabled');
  // If second_reading completed and no terminal state, the ordinance is adopted
  // (passing second reading IS adoption - there's no separate adoption vote)
  const hasSecondReading = completedActions.has('second_reading');
  const hasAdopted = completedActions.has('adopted') ||
    (hasSecondReading && !hasTabled && !hasDenied);

  // Determine if there's a public hearing in the data
  const hasPublicHearing = completedActions.has('public_hearing');

  // Build the standard progression
  const steps: TimelineStepType[] = [];

  // First Reading
  const firstReading = completedActions.get('first_reading');
  steps.push({
    action: 'first_reading',
    label: ACTION_LABELS['first_reading'],
    status: getStepStatus('first_reading', completedActions, hasAdopted || hasTabled || hasDenied),
    date: firstReading?.meeting_date || null,
    meetingId: firstReading?.meeting_id || null,
    meetingTitle: firstReading?.meeting_title,
  });

  // Insert Public Hearing if it occurred (between first and second reading)
  if (hasPublicHearing) {
    const publicHearing = completedActions.get('public_hearing');
    steps.push({
      action: 'public_hearing',
      label: ACTION_LABELS['public_hearing'],
      status: 'completed',
      date: publicHearing?.meeting_date || null,
      meetingId: publicHearing?.meeting_id || null,
      meetingTitle: publicHearing?.meeting_title,
    });
  }

  // Second Reading
  const secondReading = completedActions.get('second_reading');
  steps.push({
    action: 'second_reading',
    label: ACTION_LABELS['second_reading'],
    status: getStepStatus('second_reading', completedActions, hasAdopted || hasTabled || hasDenied),
    date: secondReading?.meeting_date || null,
    meetingId: secondReading?.meeting_id || null,
    meetingTitle: secondReading?.meeting_title,
  });

  // Handle terminal states or adoption
  if (hasDenied) {
    const deniedReading = completedActions.get('denied') || completedActions.get('rejected');
    steps.push({
      action: 'denied',
      label: ACTION_LABELS['denied'],
      status: 'completed',
      date: deniedReading?.meeting_date || null,
      meetingId: deniedReading?.meeting_id || null,
      meetingTitle: deniedReading?.meeting_title,
    });
  } else if (hasTabled) {
    const tabledReading = completedActions.get('tabled');
    steps.push({
      action: 'tabled',
      label: ACTION_LABELS['tabled'],
      status: 'completed',
      date: tabledReading?.meeting_date || null,
      meetingId: tabledReading?.meeting_id || null,
      meetingTitle: tabledReading?.meeting_title,
    });
  } else {
    // Adopted or pending adoption
    const adoptedReading = completedActions.get('adopted');
    steps.push({
      action: 'adopted',
      label: ACTION_LABELS['adopted'],
      status: getStepStatus('adopted', completedActions, hasAdopted),
      date: adoptedReading?.meeting_date || null,
      meetingId: adoptedReading?.meeting_id || null,
      meetingTitle: adoptedReading?.meeting_title,
    });
  }

  // If not showing expected steps, filter out upcoming steps
  if (!showExpectedSteps) {
    return steps.filter(s => s.status !== 'upcoming');
  }

  return steps;
}

/**
 * Normalize action key to our standard format for timeline display
 * Uses shared normalizer as base, then applies lifecycle-specific mapping
 */
function normalizeActionKey(action: string): string {
  const key = normalizeAction(action);

  // Lifecycle-specific: 'adopted' maps to second_reading stage
  // (the adoption vote IS the second reading for timeline display)
  if (key === 'adopted') return 'second_reading';

  return key;
}

/**
 * Determine step status based on completed actions
 */
function getStepStatus(
  action: string,
  completedActions: Map<string, OrdinanceLifecycleReading>,
  isProcessComplete: boolean
): TimelineStepStatus {
  if (completedActions.has(action)) {
    return 'completed';
  }

  if (isProcessComplete) {
    return 'upcoming'; // Process is done, this step was skipped
  }

  // Determine if this is the current step (next in sequence)
  const sequence = ['first_reading', 'second_reading', 'adopted'];
  const currentIndex = sequence.findIndex(a => !completedActions.has(a));

  if (sequence[currentIndex] === action) {
    return 'current';
  }

  return 'upcoming';
}

export function OrdinanceLifecycleTimeline({
  readings: initialReadings,
  ordinanceId,
  showExpectedSteps = false,
  variant = 'auto',
  compact = false,
}: OrdinanceLifecycleTimelineProps) {
  const [readings, setReadings] = useState<OrdinanceLifecycleReading[]>(initialReadings || []);
  const [loading, setLoading] = useState(false);

  // Fetch readings if ordinanceId provided and no initial readings
  useEffect(() => {
    if (ordinanceId && !initialReadings?.length) {
      setLoading(true);
      fetch(`/api/data?type=ordinance-meetings&ordinanceId=${ordinanceId}`)
        .then(res => res.json())
        .then(data => {
          // Transform the API response to match our expected format
          const meetings = data.meetings || [];
          const transformedReadings: OrdinanceLifecycleReading[] = meetings.map(
            (m: { id: string; date: string; title: string; action: string | null }) => ({
              action: m.action || 'discussed',
              meeting_id: m.id,
              meeting_date: m.date,
              meeting_title: m.title,
            })
          );
          setReadings(transformedReadings);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [ordinanceId, initialReadings]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <div className="animate-spin w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full" />
        Loading timeline...
      </div>
    );
  }

  // Don't render if no readings and not showing expected steps
  if (!readings.length && !showExpectedSteps) {
    return null;
  }

  const steps = buildTimelineSteps(readings, showExpectedSteps);

  // Determine layout based on variant
  const isVertical = variant === 'vertical' || (variant === 'auto' && steps.length > 4);

  if (isVertical) {
    return (
      <div className="flex flex-col">
        {steps.map((step, index) => (
          <TimelineStep
            key={step.action}
            step={step}
            isLast={index === steps.length - 1}
            vertical
            compact={compact}
          />
        ))}
      </div>
    );
  }

  // Horizontal layout
  return (
    <div className="flex items-start">
      {steps.map((step, index) => (
        <TimelineStep
          key={step.action}
          step={step}
          isLast={index === steps.length - 1}
          vertical={false}
          compact={compact}
        />
      ))}
    </div>
  );
}
