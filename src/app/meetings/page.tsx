'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Filter, ExternalLink, Scale, FileText } from 'lucide-react';
import MeetingCard from '@/components/MeetingCard';

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
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [loading, setLoading] = useState(true);

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

  const filteredMeetings = filter === 'all'
    ? meetings
    : meetings.filter(m => m.status === filter);

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
      </div>

      {/* Meetings List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-slate-500 mt-4">Loading meetings...</p>
        </div>
      ) : filteredMeetings.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-6">
          {filteredMeetings.map((meeting) => (
            <MeetingWithOrdinances key={meeting.id} meeting={meeting} />
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
function MeetingWithOrdinances({ meeting }: { meeting: Meeting }) {
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

  // Map action types to display labels
  const getActionLabel = (action: string | null) => {
    const actionMap: Record<string, string> = {
      'introduced': 'Introduced',
      'first_reading': 'First Reading',
      'second_reading': 'Second Reading',
      'adopted': 'Adopted',
      'tabled': 'Tabled',
      'amended': 'Amended',
      'discussed': 'Discussed',
    };
    return actionMap[action || 'discussed'] || action || 'Discussed';
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
    <div className="flex flex-col">
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
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-200 text-slate-700">
                        {getActionLabel(ord.action)}
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
