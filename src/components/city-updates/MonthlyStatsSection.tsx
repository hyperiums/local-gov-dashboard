import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';
import type { MonthlyStats } from './types';

export default function MonthlyStatsSection({ stats }: { stats: MonthlyStats }) {
  return (
    <div className="p-6">
      <div className="flex items-center mb-3">
        <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400 mr-2" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{stats.monthLabel}</h3>
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
        {stats.permits > 0 && (
          <span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{stats.permits}</span> permits issued
          </span>
        )}
        {stats.permits > 0 && stats.businesses > 0 && (
          <span className="text-slate-300 dark:text-slate-600">|</span>
        )}
        {stats.businesses > 0 && (
          <span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{stats.businesses}</span> new businesses
          </span>
        )}
      </div>

      <div className="mt-3">
        <Link
          href="/development"
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium inline-flex items-center"
        >
          View development report
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Link>
      </div>
    </div>
  );
}
