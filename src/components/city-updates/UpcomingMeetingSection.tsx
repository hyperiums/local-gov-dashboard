import Link from 'next/link';
import { Calendar, AlertCircle, ExternalLink, ArrowRight, Gavel } from 'lucide-react';
import { formatDate } from '@/lib/cityUpdates';
import { MeetingCountdownBadge } from '../MeetingCountdownBadge';
import type { NextMeeting, PendingLegislation } from './types';

export default function UpcomingMeetingSection({
  meeting,
  pendingLegislation = []
}: {
  meeting: NextMeeting;
  pendingLegislation?: PendingLegislation[];
}) {
  // Filter out agenda topics that match pending legislation to avoid redundancy
  const filteredTopics = meeting.agendaTopics.filter(topic => {
    return !pendingLegislation.some(leg => {
      const pattern = leg.type === 'ordinance'
        ? new RegExp(`Ordinance\\s*${leg.number}`, 'i')
        : new RegExp(`Resolution\\s*${leg.number}`, 'i');
      return pattern.test(topic);
    });
  });

  return (
    <div className="p-6">
      <div className="flex items-center mb-3">
        <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mr-2" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Coming Up</h3>
      </div>

      <div className="rounded-lg p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">{meeting.title}</h4>
              <MeetingCountdownBadge dateStr={meeting.date} />
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              {formatDate(meeting.date, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {/* Non-legislation Agenda Topics Preview */}
            {filteredTopics.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  {pendingLegislation.length > 0 ? 'Also on the agenda:' : 'On the agenda:'}
                </p>
                <ul className="space-y-1">
                  {filteredTopics.map((topic, idx) => (
                    <li key={idx} className="text-sm text-slate-700 dark:text-slate-300 flex items-start">
                      <span className="text-emerald-500 dark:text-emerald-400 mr-2">•</span>
                      <span className="line-clamp-1">{topic}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {filteredTopics.length === 0 && meeting.agendaCount > 0 && pendingLegislation.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                {meeting.agendaCount} agenda items
              </p>
            )}

            {/* Public Hearings Alert */}
            {meeting.publicHearings.length > 0 && (
              <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mr-2 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Public Hearing</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {meeting.publicHearings[0].length > 80
                        ? meeting.publicHearings[0].substring(0, 80) + '...'
                        : meeting.publicHearings[0]}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pending Legislation - nested inside meeting section */}
        {pendingLegislation.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
            <div className="flex items-center mb-3">
              <Gavel className="w-4 h-4 text-amber-600 dark:text-amber-400 mr-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                Legislation on this agenda
              </p>
            </div>
            <div className="space-y-2">
              {pendingLegislation.map((item) => (
                <div key={item.id} className="bg-white dark:bg-slate-700 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
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
          </div>
        )}

        {/* View Agenda button at bottom */}
        {meeting.agendaUrl && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
            <a
              href={meeting.agendaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 rounded-lg transition"
            >
              View Agenda
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
