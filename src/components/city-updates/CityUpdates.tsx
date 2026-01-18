import { getCityUpdatesData } from '@/lib/cityUpdates';
import { cityName } from '@/lib/city-config-client';
import UpcomingMeetingSection from './UpcomingMeetingSection';
import RecentDecisionsSection from './RecentDecisionsSection';
import PendingLegislationSection from './PendingLegislationSection';
import MonthlyStatsSection from './MonthlyStatsSection';
import QuietPeriodSection from './QuietPeriodSection';
import FreshnessFooter from './FreshnessFooter';

export default function CityUpdates() {
  const data = getCityUpdatesData();
  const { nextMeeting, pendingLegislation, recentDecisions, monthlyStats, freshness } = data;

  const hasContent = nextMeeting || pendingLegislation.length > 0 || recentDecisions.length > 0 || monthlyStats;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">City Updates</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">What&apos;s happening in {cityName}</p>
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
