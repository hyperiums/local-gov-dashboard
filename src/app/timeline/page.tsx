'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Clock, Filter, Calendar, Scale, FileText, ChevronDown, ChevronUp, CalendarDays, ExternalLink, List, FileDown } from 'lucide-react';
import Link from 'next/link';
import { cityName } from '@/lib/city-config-client';

type TimelineItemType = 'meeting' | 'ordinance' | 'document';
type DateRange = 'month' | 'quarter' | 'year' | 'all';

interface TimelineItem {
  id: string;
  type: TimelineItemType;
  date: string;
  title: string;
  description: string | null;
  fullDescription?: string | null;
  link: string;
  metadata?: {
    meetingType?: string;
    ordinanceNumber?: string;
    documentType?: string;
    agendaCount?: number;
    agendaPreview?: string;
    agendaUrl?: string;
    minutesUrl?: string;
    municodeUrl?: string;
    pdfUrl?: string;
  };
}

interface UpcomingMeeting {
  id: string;
  date: string;
  title: string;
  type: string;
  agendaCount: number;
}

interface MeetingDetail {
  meeting: {
    id: string;
    date: string;
    title: string;
    type: string;
    summary: string | null;
    agenda_url: string | null;
    minutes_url: string | null;
  };
  agendaItems: Array<{
    id: string;
    order_num: number;
    title: string;
    description: string | null;
  }>;
  relatedOrdinances: Array<{
    id: string;
    number: string;
    title: string;
    action: string | null;
  }>;
}

const TYPE_CONFIG: Record<TimelineItemType, { label: string; color: string; bgColor: string; icon: typeof Calendar }> = {
  meeting: {
    label: 'Meeting',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/50',
    icon: Calendar,
  },
  ordinance: {
    label: 'Ordinance',
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/50',
    icon: Scale,
  },
  document: {
    label: 'Document',
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-100 dark:bg-purple-900/50',
    icon: FileText,
  },
};

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

// Parse date string as local date (not UTC) to avoid timezone shifting
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Strip markdown bold markers for plain text display
function stripMarkdown(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}

export default function TimelinePage() {
  return (
    <Suspense fallback={<TimelineLoading />}>
      <TimelineContent />
    </Suspense>
  );
}

function TimelineLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-slate-500 dark:text-slate-400 mt-4">Loading timeline...</p>
      </div>
    </div>
  );
}

function TimelineContent() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('quarter');
  const [typeFilter, setTypeFilter] = useState<TimelineItemType | 'all'>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [meetingDetails, setMeetingDetails] = useState<Record<string, MeetingDetail>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [targetDate, setTargetDate] = useState<string | null>(null);

  // Handle date URL parameter
  useEffect(() => {
    const date = searchParams.get('date');
    if (date) {
      setTargetDate(date);
      setDateRange('all'); // Ensure date is visible
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadTimeline() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          type: 'timeline',
          dateRange,
          includeUpcoming: 'true',
          ...(typeFilter !== 'all' && { itemType: typeFilter }),
        });
        const response = await fetch(`/api/data?${params}`);
        const data = await response.json();
        setItems(data.items || []);
        setUpcoming(data.upcoming || []);
      } catch (error) {
        console.error('Failed to load timeline:', error);
      } finally {
        setLoading(false);
      }
    }

    loadTimeline();
  }, [dateRange, typeFilter]);

  // Scroll to target date after items load
  useEffect(() => {
    if (targetDate && items.length > 0 && !loading) {
      setTimeout(() => {
        const element = document.getElementById(`date-${targetDate}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [targetDate, items, loading]);

  const toggleExpand = async (itemKey: string, item: TimelineItem) => {
    const newExpanded = new Set(expandedItems);

    if (newExpanded.has(itemKey)) {
      newExpanded.delete(itemKey);
    } else {
      newExpanded.add(itemKey);

      // Load meeting details if needed
      if (item.type === 'meeting' && !meetingDetails[item.id]) {
        setLoadingDetails(prev => new Set(prev).add(item.id));
        try {
          const response = await fetch(`/api/data?type=meeting-detail&id=${item.id}`);
          const data = await response.json();
          setMeetingDetails(prev => ({ ...prev, [item.id]: data }));
        } catch (error) {
          console.error('Failed to load meeting details:', error);
        } finally {
          setLoadingDetails(prev => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }
      }
    }

    setExpandedItems(newExpanded);
  };

  // Group items by date
  const groupedItems = items.reduce((acc, item) => {
    const dateKey = item.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(item);
    return acc;
  }, {} as Record<string, TimelineItem[]>);

  const sortedDates = Object.keys(groupedItems).sort((a, b) =>
    parseLocalDate(b).getTime() - parseLocalDate(a).getTime()
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
          <Clock className="w-8 h-8 mr-3 text-emerald-500" aria-hidden="true" />
          Civic Timeline
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Recent civic activity in {cityName}
        </p>
      </div>

      {/* Upcoming Meetings Section */}
      {upcoming.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 rounded-xl border border-emerald-200 dark:border-emerald-800 p-4 mb-6">
          <div className="flex items-center mb-3">
            <CalendarDays className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2" />
            <h2 className="font-semibold text-emerald-900 dark:text-emerald-100">Upcoming Meetings</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {upcoming.map((meeting) => (
              <Link
                key={meeting.id}
                href="/meetings"
                className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800/50 hover:border-emerald-300 dark:hover:border-emerald-600 hover:shadow-sm transition"
              >
                <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {parseLocalDate(meeting.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="text-slate-900 dark:text-slate-100 font-medium mt-1">{meeting.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {meeting.agendaCount > 0
                    ? `${meeting.agendaCount} agenda items`
                    : 'Agenda not yet available'}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center">
            <Filter className="w-5 h-5 text-slate-400 mr-2" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filters:</span>
          </div>

          {/* Date Range Filter */}
          <div className="flex flex-wrap gap-2">
            {DATE_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setDateRange(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  dateRange === option.value
                    ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-600" />

          {/* Type Filter */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                typeFilter === 'all'
                  ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              All Types
            </button>
            {(Object.keys(TYPE_CONFIG) as TimelineItemType[]).map((type) => {
              const config = TYPE_CONFIG[type];
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center ${
                    typeFilter === type
                      ? `${config.bgColor} ${config.color}`
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-1" />
                  {config.label}s
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Activity Header */}
      <div className="flex items-center mb-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Recent Activity</h2>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12" role="status" aria-live="polite">
          <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto" aria-hidden="true"></div>
          <p className="text-slate-500 dark:text-slate-400 mt-4">Loading timeline...</p>
        </div>
      ) : items.length > 0 ? (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 sm:left-8 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

          <div className="space-y-8">
            {sortedDates.map((date) => (
              <div
                key={date}
                id={`date-${date}`}
                className={`relative ${date === targetDate ? 'border-l-4 border-emerald-500 pl-2 -ml-2' : ''}`}
              >
                {/* Date marker */}
                <div className="flex items-center mb-4">
                  <div className="relative z-10 w-8 h-8 sm:w-16 sm:h-8 bg-emerald-600 rounded-full sm:rounded-lg flex items-center justify-center">
                    <span className="text-white text-xs font-semibold hidden sm:block">
                      {parseLocalDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-white text-xs font-semibold sm:hidden">
                      {parseLocalDate(date).getDate()}
                    </span>
                  </div>
                  <div className="ml-4 text-sm text-slate-500 dark:text-slate-400">
                    {parseLocalDate(date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>

                {/* Items for this date */}
                <div className="ml-12 sm:ml-20 space-y-3">
                  {groupedItems[date].map((item) => {
                    const config = TYPE_CONFIG[item.type];
                    const Icon = config.icon;
                    const itemKey = `${item.type}-${item.id}`;
                    const isExpanded = expandedItems.has(itemKey);
                    const isLoadingDetail = loadingDetails.has(item.id);
                    const detail = meetingDetails[item.id];

                    return (
                      <div
                        key={itemKey}
                        className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition ${
                          isExpanded ? 'border-emerald-300 dark:border-emerald-700 shadow-md' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {/* Header - clickable to expand */}
                        <button
                          onClick={() => toggleExpand(itemKey, item)}
                          className="w-full p-4 text-left"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center flex-wrap gap-2 mb-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                                  <Icon className="w-3 h-3 mr-1" />
                                  {config.label}
                                </span>
                                {item.metadata?.ordinanceNumber && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                                    #{item.metadata.ordinanceNumber}
                                  </span>
                                )}
                                {item.metadata?.meetingType && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 capitalize">
                                    {item.metadata.meetingType.replace('_', ' ')}
                                  </span>
                                )}
                                {item.metadata?.documentType && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 uppercase">
                                    {item.metadata.documentType}
                                  </span>
                                )}
                              </div>
                              <h3 className="font-medium text-slate-900 dark:text-slate-100">
                                {item.title}
                              </h3>
                              {!isExpanded && item.description && (
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                  {stripMarkdown(item.description)}
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 ml-4">
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700">
                            {item.type === 'meeting' && (
                              <MeetingExpandedContent
                                item={item}
                                detail={detail}
                                isLoading={isLoadingDetail}
                              />
                            )}
                            {item.type === 'ordinance' && (
                              <OrdinanceExpandedContent item={item} />
                            )}
                            {item.type === 'document' && (
                              <DocumentExpandedContent item={item} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Clock className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No activity found</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            {typeFilter !== 'all'
              ? `No ${TYPE_CONFIG[typeFilter].label.toLowerCase()}s found for the selected time period.`
              : 'No civic activity found for the selected time period.'}
          </p>
          <p className="text-sm text-slate-400">
            Try selecting a different date range or filter.
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/30 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">About This Page</h3>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Stay informed about {cityName} government activity. Click on any item to see more details,
          agenda items, and links to official sources. The upcoming meetings section shows when you can
          attend or watch the next public meetings.
        </p>
      </div>
    </div>
  );
}

// Meeting Expanded Content Component
function MeetingExpandedContent({
  item,
  detail,
  isLoading
}: {
  item: TimelineItem;
  detail?: MeetingDetail;
  isLoading: boolean;
}) {
  const [showAllAgenda, setShowAllAgenda] = useState(false);

  if (isLoading) {
    return (
      <div className="pt-4 flex items-center text-sm text-slate-500 dark:text-slate-400">
        <div className="animate-spin w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full mr-2"></div>
        Loading details...
      </div>
    );
  }

  const agendaItems = detail?.agendaItems || [];
  const relatedOrdinances = detail?.relatedOrdinances || [];
  const displayedAgenda = showAllAgenda ? agendaItems : agendaItems.slice(0, 5);

  return (
    <div className="pt-4 space-y-4">
      {/* Quick Links */}
      <div className="flex flex-wrap gap-2">
        {item.metadata?.agendaUrl && (
          <a
            href={item.metadata.agendaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm hover:bg-blue-100 dark:hover:bg-blue-900/50 transition"
          >
            <List className="w-4 h-4 mr-1.5" />
            View Agenda/Minutes
            <ExternalLink className="w-3 h-3 ml-1.5" />
          </a>
        )}
      </div>

      {/* Agenda Items */}
      {agendaItems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center">
            <List className="w-4 h-4 mr-1.5" />
            Agenda Items ({agendaItems.length})
          </h4>
          <ul className="space-y-1.5">
            {displayedAgenda.map((agenda, idx) => (
              <li key={agenda.id} className="text-sm text-slate-600 dark:text-slate-400 flex">
                <span className="text-slate-400 mr-2 flex-shrink-0">{idx + 1}.</span>
                <span>{agenda.title}</span>
              </li>
            ))}
          </ul>
          {agendaItems.length > 5 && (
            <button
              onClick={() => setShowAllAgenda(!showAllAgenda)}
              className="mt-2 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium"
            >
              {showAllAgenda ? 'Show less' : `Show all ${agendaItems.length} items`}
            </button>
          )}
        </div>
      )}

      {/* Related Ordinances */}
      {relatedOrdinances.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center">
            <Scale className="w-4 h-4 mr-1.5" />
            Related Ordinances
          </h4>
          <ul className="space-y-1.5">
            {relatedOrdinances.map((ord) => (
              <li key={ord.id} className="text-sm flex items-center">
                <Link
                  href={`/ordinances?search=${ord.number}`}
                  className="text-amber-600 dark:text-amber-400 font-medium mr-2 hover:text-amber-700 dark:hover:text-amber-300 hover:underline"
                >
                  #{ord.number}
                </Link>
                <span className="text-slate-600 dark:text-slate-400 truncate flex-1">{ord.title}</span>
                {ord.action && (
                  <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded ml-2 capitalize">
                    {ord.action.replace('_', ' ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Ordinance Expanded Content Component
function OrdinanceExpandedContent({ item }: { item: TimelineItem }) {
  return (
    <div className="pt-4 space-y-4">
      {/* Quick Links */}
      <div className="flex flex-wrap gap-2">
        {item.metadata?.ordinanceNumber && (
          <Link
            href={`/ordinances?search=${item.metadata.ordinanceNumber}`}
            className="inline-flex items-center px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition"
          >
            <Scale className="w-4 h-4 mr-1.5" />
            View Details
          </Link>
        )}
        {item.metadata?.municodeUrl && (
          <a
            href={item.metadata.municodeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-sm hover:bg-amber-100 dark:hover:bg-amber-900/50 transition"
          >
            <Scale className="w-4 h-4 mr-1.5" />
            View on Municode
            <ExternalLink className="w-3 h-3 ml-1.5" />
          </a>
        )}
      </div>

      {/* Full Description/Summary */}
      {item.fullDescription && (
        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
          {item.fullDescription.split('\n').filter(p => p.trim()).map((paragraph, idx) => {
            // Handle bold text with ** markers
            const formatted = paragraph.replace(
              /\*\*([^*]+)\*\*/g,
              '<strong class="font-semibold text-slate-800 dark:text-slate-200">$1</strong>'
            );
            return (
              <p
                key={idx}
                dangerouslySetInnerHTML={{ __html: formatted }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Document Expanded Content Component
function DocumentExpandedContent({ item }: { item: TimelineItem }) {
  return (
    <div className="pt-4 space-y-4">
      {/* Quick Links */}
      <div className="flex flex-wrap gap-2">
        {item.metadata?.pdfUrl && (
          <a
            href={item.metadata.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm hover:bg-purple-100 dark:hover:bg-purple-900/50 transition"
          >
            <FileDown className="w-4 h-4 mr-1.5" />
            Download PDF
            <ExternalLink className="w-3 h-3 ml-1.5" />
          </a>
        )}
      </div>

      {/* Full Description/Summary */}
      {item.fullDescription && (
        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
          {item.fullDescription.split('\n').filter(p => p.trim()).slice(0, 10).map((paragraph, idx) => {
            // Handle bold text with ** markers
            const formatted = paragraph.replace(
              /\*\*([^*]+)\*\*/g,
              '<strong class="font-semibold text-slate-800 dark:text-slate-200">$1</strong>'
            );
            return (
              <p
                key={idx}
                dangerouslySetInnerHTML={{ __html: formatted }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
