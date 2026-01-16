import Link from 'next/link';
import { Calendar, Scale, FileText, Clock, AlertCircle, ExternalLink, ArrowRight, Building2, Gavel } from 'lucide-react';
import {
  getCityUpdatesData,
  formatDate,
  type RecentDecision,
  type PendingLegislation,
} from '@/lib/cityUpdates';
import { MeetingCountdownBadge } from './MeetingCountdownBadge';

export default function CityUpdates() {
  const data = getCityUpdatesData();
  const { nextMeeting, pendingLegislation, recentDecisions, monthlyStats, freshness } = data;

  const hasContent = nextMeeting || pendingLegislation.length > 0 || recentDecisions.length > 0 || monthlyStats;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">City Updates</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">What&apos;s happening in Flowery Branch</p>
      </div>

      {hasContent ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {/* Coming Up Section - includes pending legislation when there's a meeting */}
          {nextMeeting && (
            <UpcomingMeetingSection meeting={nextMeeting} pendingLegislation={pendingLegislation} />
          )}

          {/* Pending Legislation Section - only show separately when no meeting */}
          {!nextMeeting && pendingLegislation.length > 0 && (
            <PendingLegislationSection legislation={pendingLegislation} />
          )}

          {/* Recent Decisions Section */}
          {recentDecisions.length > 0 && (
            <RecentDecisionsSection decisions={recentDecisions} />
          )}

          {/* Monthly Stats Section */}
          {monthlyStats && (monthlyStats.permits > 0 || monthlyStats.businesses > 0) && (
            <MonthlyStatsSection stats={monthlyStats} />
          )}
        </div>
      ) : (
        <QuietPeriodSection />
      )}

      {/* Freshness Footer */}
      <FreshnessFooter freshness={freshness} />
    </div>
  );
}

// Upcoming Meeting Section
function UpcomingMeetingSection({
  meeting,
  pendingLegislation = []
}: {
  meeting: NonNullable<ReturnType<typeof getCityUpdatesData>['nextMeeting']>;
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

// Recent Decisions Section
function RecentDecisionsSection({ decisions }: { decisions: RecentDecision[] }) {
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

// Individual Decision Item
function DecisionItem({ decision }: { decision: RecentDecision }) {
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

// Pending Legislation Section
function PendingLegislationSection({ legislation }: { legislation: PendingLegislation[] }) {
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

// Monthly Stats Section
function MonthlyStatsSection({ stats }: { stats: NonNullable<ReturnType<typeof getCityUpdatesData>['monthlyStats']> }) {
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

// Quiet Period Section
function QuietPeriodSection() {
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
          href="https://flowerybranchga.portal.civicclerk.com"
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

// Freshness Footer
function FreshnessFooter({ freshness }: { freshness: ReturnType<typeof getCityUpdatesData>['freshness'] }) {
  if (!freshness.lastMeetingDate) return null;

  return (
    <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
      <span>Data through {formatDate(freshness.lastMeetingDate, { month: 'short', day: 'numeric' })}</span>
    </div>
  );
}
