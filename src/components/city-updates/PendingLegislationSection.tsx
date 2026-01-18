import Link from 'next/link';
import { Gavel, ArrowRight } from 'lucide-react';
import type { PendingLegislation } from './types';

export default function PendingLegislationSection({ legislation }: { legislation: PendingLegislation[] }) {
  return (
    <div className="p-6">
      <div className="flex items-center mb-3">
        <Gavel className="w-4 h-4 text-amber-600 dark:text-amber-400 mr-2" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Being Considered</h3>
      </div>

      <div className="space-y-3">
        {legislation.map((item) => (
          <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.type === 'ordinance' ? (
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
                      Ordinance {item.number}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-1.5 py-0.5 rounded">
                      Resolution {item.number}
                    </span>
                  )}
                  {item.status === 'first_reading' && (
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded">
                      First Reading
                    </span>
                  )}
                  {item.status === 'second_reading' && (
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded">
                      Second Reading
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 line-clamp-2">
                  {item.title}
                </p>
                {item.summary && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {item.summary}
                  </p>
                )}
                <Link
                  href={item.type === 'ordinance'
                    ? `/ordinances?search=${item.number}`
                    : `/resolutions?search=${item.number}`}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 mt-1.5 inline-flex items-center"
                >
                  View details
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-4">
        <Link
          href="/ordinances"
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium inline-flex items-center"
        >
          All ordinances
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Link>
        <Link
          href="/resolutions"
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium inline-flex items-center"
        >
          All resolutions
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Link>
      </div>
    </div>
  );
}
