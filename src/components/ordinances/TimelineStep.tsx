import Link from 'next/link';
import { Check, X, Pause, Circle } from 'lucide-react';
import type { TimelineStep as TimelineStepType, TimelineStepStatus } from './types';
import { formatDate } from '@/lib/dates';

interface TimelineStepProps {
  step: TimelineStepType;
  /** Whether this is the last step (no connector line after) */
  isLast?: boolean;
  /** Vertical or horizontal layout */
  vertical?: boolean;
  /** Compact mode for smaller spaces */
  compact?: boolean;
}

export function TimelineStep({ step, isLast = false, vertical = false, compact = false }: TimelineStepProps) {
  const { status, label, date, meetingId, action } = step;

  const isTerminal = action === 'tabled' || action === 'denied';
  const isDenied = action === 'denied';
  const isTabled = action === 'tabled';

  // Style based on status and terminal state
  const getCircleStyles = (): string => {
    if (isDenied) {
      return 'bg-red-500 text-white';
    }
    if (isTabled) {
      return 'bg-amber-500 text-white';
    }
    switch (status) {
      case 'completed':
        return 'bg-emerald-500 text-white';
      case 'current':
        return 'bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-700';
      case 'upcoming':
      default:
        return 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400';
    }
  };

  const getLabelStyles = (): string => {
    if (status === 'completed' || status === 'current' || isTerminal) {
      return 'text-slate-700 dark:text-slate-200 font-medium';
    }
    return 'text-slate-400 dark:text-slate-500';
  };

  const getConnectorStyles = (): string => {
    if (status === 'completed') {
      return 'bg-emerald-300 dark:bg-emerald-600';
    }
    return 'bg-slate-200 dark:bg-slate-600';
  };

  const getIcon = () => {
    if (isDenied) return <X className="w-3.5 h-3.5" />;
    if (isTabled) return <Pause className="w-3.5 h-3.5" />;
    if (status === 'completed') return <Check className="w-3.5 h-3.5" />;
    if (status === 'current') return <Circle className="w-2.5 h-2.5 fill-current" />;
    return null;
  };

  const circleSize = compact ? 'w-5 h-5' : 'w-6 h-6';
  const textSize = compact ? 'text-[10px]' : 'text-xs';

  const circleContent = (
    <div
      className={`
        ${circleSize} rounded-full flex items-center justify-center text-xs font-medium
        ${getCircleStyles()}
        ${meetingId ? 'cursor-pointer hover:scale-110 transition-transform' : ''}
      `}
      title={date ? formatDate(date) : undefined}
    >
      {getIcon()}
    </div>
  );

  const content = vertical ? (
    // Vertical layout
    <div className="flex items-start gap-3">
      {/* Circle and connector */}
      <div className="flex flex-col items-center">
        {meetingId ? (
          <Link href={`/meetings?expand=${meetingId}&section=ordinances`}>
            {circleContent}
          </Link>
        ) : (
          circleContent
        )}
        {!isLast && (
          <div className={`w-0.5 h-6 ${getConnectorStyles()} mt-1`} />
        )}
      </div>

      {/* Label and date */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {meetingId ? (
            <Link
              href={`/meetings?expand=${meetingId}&section=ordinances`}
              className={`${textSize} ${getLabelStyles()} hover:text-emerald-600 dark:hover:text-emerald-400`}
            >
              {label}
            </Link>
          ) : (
            <span className={`${textSize} ${getLabelStyles()}`}>{label}</span>
          )}
          {date && (
            <span className={`${textSize} text-slate-400 dark:text-slate-500`}>
              {formatDate(date, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
    </div>
  ) : (
    // Horizontal layout
    <div className="flex items-center flex-1">
      <div className="flex flex-col items-center">
        {meetingId ? (
          <Link href={`/meetings?expand=${meetingId}&section=ordinances`}>
            {circleContent}
          </Link>
        ) : (
          circleContent
        )}
        <span className={`mt-1 ${textSize} whitespace-nowrap ${getLabelStyles()}`}>
          {label}
        </span>
        {date && status !== 'upcoming' && (
          <span className={`${textSize} text-slate-400 dark:text-slate-500 whitespace-nowrap`}>
            {formatDate(date, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {/* Connector line */}
      {!isLast && (
        <div className={`flex-1 h-0.5 mx-1 ${getConnectorStyles()}`} />
      )}
    </div>
  );

  return content;
}
