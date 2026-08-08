'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { FeedStatus } from '@/lib/feed-status';

// Every permit figure on this page is only as current as the last time
// collection actually ran, so that fact is shown next to the figures rather
// than left for a reader to assume. The wording distinguishes "the city has
// not posted it yet" from "we could not fetch it" — a distinction the page
// previously could not make, which let the feed sit blind and look normal.

const STYLES: Record<
  FeedStatus['level'],
  { wrap: string; icon: typeof CheckCircle2; iconClass: string; label: string }
> = {
  ok: {
    wrap: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    label: 'Permit feed healthy',
  },
  info: {
    wrap: 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700',
    icon: Clock,
    iconClass: 'text-slate-500 dark:text-slate-400',
    label: 'Permit feed status',
  },
  warn: {
    wrap: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800',
    icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-400',
    label: 'Permit feed warning',
  },
  error: {
    wrap: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800',
    icon: XCircle,
    iconClass: 'text-red-600 dark:text-red-400',
    label: 'Permit feed error',
  },
};

function formatTimestamp(value: string | null): string {
  if (!value) return 'never';
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PermitFeedStatus() {
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/data?type=permit-feed-status')
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then(setStatus)
      .catch(() => setFailed(true));
  }, []);

  // A status line that cannot load must say so. Rendering nothing would read
  // as "no problems" — the exact silence this component exists to break.
  if (failed) {
    return (
      <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
        <div className="flex items-start">
          <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Could not load permit collection status, so the freshness of the figures below is unverified.
          </p>
        </div>
      </div>
    );
  }

  if (!status) return null;

  const style = STYLES[status.level];
  const Icon = style.icon;

  return (
    <div
      role={status.level === 'error' || status.level === 'warn' ? 'alert' : undefined}
      className={`mb-6 rounded-xl border p-4 ${style.wrap}`}
    >
      <div className="flex items-start">
        <Icon className={`w-5 h-5 mr-3 mt-0.5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="sr-only">{style.label}</p>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{status.headline}</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{status.detail}</p>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex gap-1">
              <dt>Last collected data:</dt>
              <dd className="font-medium">{formatTimestamp(status.lastCollectedAt)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Last checked:</dt>
              <dd className="font-medium">{formatTimestamp(status.lastCheckedAt)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Newest month held:</dt>
              <dd className="font-medium">{status.newestMonthHeld ?? 'none'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
