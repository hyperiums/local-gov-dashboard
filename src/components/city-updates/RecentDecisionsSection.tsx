import Link from 'next/link';
import { FileText, ArrowRight } from 'lucide-react';
import { formatDate } from '@/lib/cityUpdates';
import DecisionItem from './DecisionItem';
import type { RecentDecision } from './types';

export default function RecentDecisionsSection({ decisions }: { decisions: RecentDecision[] }) {
  // Group decisions by meeting date
  const groupedByDate: Record<string, RecentDecision[]> = {};
  for (const decision of decisions) {
    const dateKey = decision.meetingDate;
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(decision);
  }

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="p-6">
      <div className="flex items-center mb-3">
        <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400 mr-2" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Recent Decisions</h3>
      </div>

      <div className="space-y-4">
        {sortedDates.map(dateKey => (
          <div key={dateKey}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              {formatDate(dateKey, { month: 'short', day: 'numeric' })}
            </p>
            <ul className="space-y-2">
              {groupedByDate[dateKey].map((decision, idx) => (
                <DecisionItem key={`${dateKey}-${idx}`} decision={decision} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Link
          href="/timeline"
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium inline-flex items-center"
        >
          See all activity
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Link>
      </div>
    </div>
  );
}
