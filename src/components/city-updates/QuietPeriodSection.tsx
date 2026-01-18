import Link from 'next/link';
import { Clock, ExternalLink } from 'lucide-react';
import { civicClerkUrl } from '@/lib/city-config-client';

export default function QuietPeriodSection() {
  return (
    <div className="p-8 text-center">
      <Clock className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
      <h3 className="font-medium text-slate-700 dark:text-slate-300 mb-1">Things are quiet right now</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        No upcoming meetings or recent activity to report.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href="/meetings"
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium"
        >
          View past meetings
        </Link>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <a
          href={civicClerkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium inline-flex items-center"
        >
          Official calendar
          <ExternalLink className="w-3 h-3 ml-1" />
        </a>
      </div>
    </div>
  );
}
