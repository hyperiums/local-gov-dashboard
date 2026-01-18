import { formatDate } from '@/lib/cityUpdates';
import type { Freshness } from './types';

export default function FreshnessFooter({ freshness }: { freshness: Freshness }) {
  if (!freshness.lastMeetingDate) return null;

  return (
    <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
      <span>Data through {formatDate(freshness.lastMeetingDate, { month: 'short', day: 'numeric' })}</span>
    </div>
  );
}
