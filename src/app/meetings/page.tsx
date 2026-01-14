'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Filter, ExternalLink, Scale, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import MeetingCard from '@/components/MeetingCard';
import { getRecentYears } from '@/lib/dates';

interface Meeting {
  id: string;
  date: string;
  title: string;
  location?: string;
  status: string;
  agenda_url?: string;
  minutes_url?: string;
  packet_url?: string;
  summary?: string;
  agenda_summary?: string;
  minutes_summary?: string;
}

interface OrdinanceWithAction {
  id: string;
  number: string;
  title: string;
  action: string | null;
  municode_url: string | null;
}

interface ResolutionWithMeeting {
  id: string;
  number: string;
  title: string;
  status: string;
  summary: string | null;
  adopted_date: string | null;
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={<MeetingsLoading />}>
      <MeetingsContent />
    </Suspense>
  );
}

function MeetingsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-slate-500 mt-4">Loading meetings...</p>
      </div>
    </div>
  );
}

function MeetingsContent() {
  const searchParams = useSearchParams();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [loading, setLoading] = useState(true);
  const [expandMeeting, setExpandMeeting] = useState<string | null>(null);
  const [expandSection, setExpandSection] = useState<string | null>(null);
  const defaultExpandedYears = useMemo(() => new Set(getRecentYears(1)), []);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(defaultExpandedYears);

  // Handle expand and section params from URL
  useEffect(() => {
    const expand = searchParams.get('expand');
    const section = searchParams.get('section');
    if (expand) {
      setExpandMeeting(expand);
    }
    if (section) {
      setExpandSection(section);
    }
  }, [searchParams]);

  // Auto-expand year and scroll to meeting when expand param is set
  useEffect(() => {
    if (expandMeeting && meetings.length > 0) {
      // Find the meeting and expand its year
      const meeting = meetings.find(m => m.id === expandMeeting);
      if (meeting) {
        const year = meeting.date.substring(0, 4);
        setExpandedYears(prev => new Set([...prev, year]));
      }
      // Scroll to the meeting after year expansion renders
      setTimeout(() => {
        const element = document.getElementById(`meeting-${expandMeeting}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  }, [expandMeeting, meetings]);

  useEffect(() => {
    async function loadMeetings() {
      try {
        const params = filter !== 'all' ? `?type=meetings&status=${filter}` : '?type=meetings';
        const response = await fetch(`/api/data${params}`);
        const data = await response.json();
        setMeetings(data.meetings || []);
      } catch (error) {
        console.error('Failed to load meetings:', error);
      } finally {
        setLoading(false);
      }
    }

    loadMeetings();
  }, [filter]);

  // Filter meetings by status
  const filteredMeetings = filter === 'all'
    ? meetings
    : meetings.filter(m => m.status === filter);

  // Group meetings by year
  const meetingsByYear = filteredMeetings.reduce((acc, m) => {
    const year = m.date.substring(0, 4);
    if (!acc[year]) acc[year] = [];
    acc[year].push(m);
    return acc;
  }, {} as Record<string, Meeting[]>);

  // Sort years descending
  const years = Object.keys(meetingsByYear).sort((a, b) => parseInt(b) - parseInt(a));

  // Get unique months for dropdown (format: YYYY-MM)
  const monthOptions = useMemo(() => {
    const months = new Set(filteredMeetings.map(m => m.date.substring(0, 7)));
    return Array.from(months).sort().reverse().map(ym => {
      const [year, month] = ym.split('-');
      const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long' });
      return { value: ym, label: `${monthName} ${year}` };
    });
  }, [filteredMeetings]);

  const toggleYear = (year: string) => {
    const newExpanded = new Set(expandedYears);
    if (newExpanded.has(year)) {
      newExpanded.delete(year);
    } else {
      newExpanded.add(year);
    }
    setExpandedYears(newExpanded);
  };

  const handleJumpToMonth = (yearMonth: string) => {
    if (!yearMonth) return;
    const year = yearMonth.substring(0, 4);
    setExpandedYears(prev => new Set([...prev, year]));
    // Find first meeting of that month and scroll to it
    const meeting = filteredMeetings.find(m => m.date.startsWith(yearMonth));
    if (meeting) {
      setTimeout(() => {
        document.getElementById(`meeting-${meeting.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center">
            <Calendar className="w-8 h-8 mr-3 text-emerald-500" />
            City Council Meetings
          </h1>
          <p className="text-slate-600 mt-1">
            Browse past and upcoming city council meetings
          </p>
        </div>
        <a
          href="https://flowerybranchga.portal.civicclerk.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
        >
          Official Portal
          <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-slate-400" />
            <div className="flex space-x-2">
              {(['all', 'upcoming', 'past'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    filter === f
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {/* Jump to Month dropdown */}
          {monthOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Jump to:</span>
              <select
                onChange={(e) => handleJumpToMonth(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                defaultValue=""
              >
                <option value="">Select month...</option>
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Meetings List - Grouped by Year */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-slate-500 mt-4">Loading meetings...</p>
        </div>
      ) : years.length > 0 ? (
        <div className="space-y-4">
          {years.map((year) => (
            <div
              key={year}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <button
                onClick={() => toggleYear(year)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition"
              >
                <div className="flex items-center">
                  {expandedYears.has(year) ? (
                    <ChevronDown className="w-5 h-5 text-slate-400 mr-2" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400 mr-2" />
                  )}
                  <h2 className="text-lg font-semibold text-slate-900">{year}</h2>
                  <span className="ml-3 text-sm text-slate-500">
                    {meetingsByYear[year].length} meeting{meetingsByYear[year].length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
              {expandedYears.has(year) && (
                <div className="border-t border-slate-200 p-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    {meetingsByYear[year]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((meeting) => (
                        <MeetingWithOrdinances
                          key={meeting.id}
                          meeting={meeting}
                          highlighted={meeting.id === expandMeeting}
                          expandOrdinances={meeting.id === expandMeeting && expandSection === 'ordinances'}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No meetings found</h3>
          <p className="text-slate-500 mb-4">
            {filter === 'upcoming'
              ? 'No upcoming meetings in the database.'
              : filter === 'past'
              ? 'No past meetings in the database.'
              : 'No meetings have been added yet.'}
          </p>
          <p className="text-sm text-slate-400">
            Visit the{' '}
            <a
              href="https://flowerybranchga.portal.civicclerk.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:underline"
            >
              CivicClerk Portal
            </a>{' '}
            for the official meeting schedule, or use the{' '}
            <a href="/admin" className="text-emerald-600 hover:underline">
              admin panel
            </a>{' '}
            to import data.
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">About This Data</h3>
        <p className="text-sm text-blue-800">
          Meeting information is sourced from the official Flowery Branch CivicClerk portal.
          City Council meetings typically occur on the 1st and 3rd Thursday of each month at 6:00 PM
          at City Hall (5410 Pine Street). AI-generated summaries are provided for convenience
          but should not replace reading the official documents.
        </p>
      </div>
    </div>
  );
}

// Wrapper component that adds ordinance and resolution display to MeetingCard
function MeetingWithOrdinances({ meeting, highlighted, expandOrdinances }: {
  meeting: Meeting;
  highlighted?: boolean;
  expandOrdinances?: boolean;
}) {
  const [ordinances, setOrdinances] = useState<OrdinanceWithAction[]>([]);
  const [resolutions, setResolutions] = useState<ResolutionWithMeeting[]>([]);
  const [loadingOrdinances, setLoadingOrdinances] = useState(false);
  const [loadingResolutions, setLoadingResolutions] = useState(false);
  const [showOrdinances, setShowOrdinances] = useState(false);
  const [showResolutions, setShowResolutions] = useState(false);

  const loadOrdinances = async () => {
    if (ordinances.length > 0 || loadingOrdinances) return;
    setLoadingOrdinances(true);
    try {
      const response = await fetch(`/api/data?type=ordinance-meetings&meetingId=${meeting.id}`);
      const data = await response.json();
      setOrdinances(data.ordinances || []);
    } catch (error) {
      console.error('Failed to load ordinances:', error);
    } finally {
      setLoadingOrdinances(false);
    }
  };

  const loadResolutions = async () => {
    if (resolutions.length > 0 || loadingResolutions) return;
    setLoadingResolutions(true);
    try {
      const response = await fetch(`/api/data?type=resolution-meetings&meetingId=${meeting.id}`);
      const data = await response.json();
      setResolutions(data.resolutions || []);
    } catch (error) {
      console.error('Failed to load resolutions:', error);
    } finally {
      setLoadingResolutions(false);
    }
  };

  const toggleOrdinances = () => {
    if (!showOrdinances) {
      loadOrdinances();
    }
    setShowOrdinances(!showOrdinances);
  };

  const toggleResolutions = () => {
    if (!showResolutions) {
      loadResolutions();
    }
    setShowResolutions(!showResolutions);
  };

  // Auto-expand ordinances when navigating from ordinance page (runs once on mount)
  useEffect(() => {
    if (expandOrdinances) {
      toggleOrdinances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandOrdinances]);

  // Map action types to display labels and colors
  const getActionDisplay = (action: string | null) => {
    const actionMap: Record<string, { label: string; color: string }> = {
      'introduced': { label: 'Introduced', color: 'bg-blue-100 text-blue-700' },
      'first_reading': { label: 'First Reading', color: 'bg-yellow-100 text-yellow-700' },
      'second_reading': { label: 'Second Reading', color: 'bg-orange-100 text-orange-700' },
      'adopted': { label: 'Adopted', color: 'bg-emerald-100 text-emerald-700' },
      'tabled': { label: 'Tabled', color: 'bg-slate-200 text-slate-700' },
      'amended': { label: 'Amended', color: 'bg-purple-100 text-purple-700' },
      'discussed': { label: 'Discussed', color: 'bg-slate-200 text-slate-700' },
      'denied': { label: 'Denied', color: 'bg-red-100 text-red-700' },
      'rejected': { label: 'Rejected', color: 'bg-red-100 text-red-700' },
    };
    return actionMap[action || 'discussed'] || { label: action || 'Discussed', color: 'bg-slate-200 text-slate-700' };
  };

  // Map resolution status to display style
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'adopted':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'tabled':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-slate-200 text-slate-700';
    }
  };

  return (
    <div
      id={`meeting-${meeting.id}`}
      className={`flex flex-col ${highlighted ? 'ring-2 ring-emerald-500 ring-offset-2 rounded-xl' : ''}`}
    >
      <MeetingCard meeting={meeting} showSummary />

      {/* Toggle Buttons Row */}
      <div className="mt-2 flex gap-2">
        {/* Ordinances Toggle Button */}
        <button
          onClick={toggleOrdinances}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 rounded-lg text-sm text-slate-600 transition border border-slate-200 shadow-sm"
        >
          <Scale className="w-4 h-4 text-emerald-500" />
          {showOrdinances ? 'Hide Ordinances' : 'Ordinances'}
        </button>

        {/* Resolutions Toggle Button */}
        <button
          onClick={toggleResolutions}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 rounded-lg text-sm text-slate-600 transition border border-slate-200 shadow-sm"
        >
          <FileText className="w-4 h-4 text-blue-500" />
          {showResolutions ? 'Hide Resolutions' : 'Resolutions'}
        </button>
      </div>

      {/* Ordinances Section */}
      {showOrdinances && (
        <div className="mt-2 bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <div className="flex items-center text-sm font-medium text-slate-700 mb-3">
            <Scale className="w-4 h-4 mr-2 text-emerald-500" />
            Ordinances Discussed
          </div>

          {loadingOrdinances ? (
            <div className="flex items-center text-sm text-slate-500">
              <div className="animate-spin w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full mr-2"></div>
              Loading...
            </div>
          ) : ordinances.length > 0 ? (
            <div className="space-y-2">
              {ordinances.map((ord) => (
                <div key={ord.id} className="flex items-start justify-between p-2 bg-slate-50 rounded-lg">
                  <Link
                    href={`/ordinances?expand=${ord.number}`}
                    className="flex-1 hover:bg-slate-100 rounded transition -m-2 p-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                        #{ord.number}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${getActionDisplay(ord.action).color}`}>
                        {getActionDisplay(ord.action).label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1">{ord.title}</p>
                  </Link>
                  {ord.municode_url && (
                    <a
                      href={ord.municode_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 p-1.5 text-slate-400 hover:text-emerald-600 transition shrink-0"
                      title="View official text on Municode"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No ordinances were discussed at this meeting.</p>
          )}
        </div>
      )}

      {/* Resolutions Section */}
      {showResolutions && (
        <div className="mt-2 bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <div className="flex items-center text-sm font-medium text-slate-700 mb-3">
            <FileText className="w-4 h-4 mr-2 text-blue-500" />
            Resolutions
          </div>

          {loadingResolutions ? (
            <div className="flex items-center text-sm text-slate-500">
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
              Loading...
            </div>
          ) : resolutions.length > 0 ? (
            <div className="space-y-2">
              {resolutions.map((res) => (
                <Link
                  key={res.id}
                  href={`/resolutions?expand=${res.number}`}
                  className="block p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      #{res.number}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs capitalize ${getStatusStyle(res.status)}`}>
                      {res.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-1">{res.title}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No resolutions were passed at this meeting.</p>
          )}
        </div>
      )}
    </div>
  );
}
