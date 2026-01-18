import Link from 'next/link';
import { Scale, FileText, ArrowRight, ExternalLink } from 'lucide-react';
import type { RecentDecision } from './types';

export default function DecisionItem({ decision }: { decision: RecentDecision }) {
  const getIcon = () => {
    switch (decision.type) {
      case 'ordinance': return <Scale className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'budget': return <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'resolution': return <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      default: return <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />;
    }
  };

  const getTypeLabel = () => {
    switch (decision.type) {
      case 'ordinance': return 'Ordinance';
      case 'budget': return 'Budget';
      case 'resolution': return 'Resolution';
      default: return null;
    }
  };

  return (
    <li className="flex items-start">
      <span className="mr-2 mt-0.5 flex-shrink-0">{getIcon()}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-1.5">
          {decision.ordinanceNumber && (
            <span className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
              #{decision.ordinanceNumber}
            </span>
          )}
          {getTypeLabel() && !decision.ordinanceNumber && (
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
              {getTypeLabel()}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 line-clamp-2">{decision.decision}</p>
        {/* Links based on decision type */}
        {decision.type === 'ordinance' && decision.municodeUrl && (
          <a
            href={decision.municodeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 mt-1 inline-flex items-center"
          >
            View on Municode
            <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        )}
        {decision.type === 'ordinance' && decision.ordinanceNumber && !decision.municodeUrl && (
          <Link
            href={`/ordinances?search=${decision.ordinanceNumber}`}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 mt-1 inline-flex items-center"
          >
            View details
            <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        )}
        {decision.type === 'budget' && (
          <Link
            href="/budget"
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 mt-1 inline-flex items-center"
          >
            View budget details
            <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        )}
        {decision.type === 'resolution' && (
          <Link
            href={decision.resolutionNumber ? `/resolutions?search=${decision.resolutionNumber}` : '/resolutions'}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 mt-1 inline-flex items-center"
          >
            View resolution details
            <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        )}
        {decision.type === 'other' && decision.meetingDate && (
          <Link
            href={`/timeline?date=${decision.meetingDate}`}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 mt-1 inline-flex items-center"
          >
            View in timeline
            <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        )}
      </div>
    </li>
  );
}
