'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Scale, ExternalLink, Search, ChevronDown, ChevronRight, Sparkles, Calendar, Clock } from 'lucide-react';
import { getRecentYears } from '@/lib/dates';

interface Ordinance {
  id: string;
  number: string;
  title: string;
  description: string | null;
  summary: string | null;
  status: string;
  introduced_date: string | null;
  adopted_date: string | null;
  municode_url: string | null;
}

interface MeetingWithAction {
  id: string;
  date: string;
  title: string;
  action: string | null;
}

export default function OrdinancesPage() {
  return (
    <Suspense fallback={<OrdinancesLoading />}>
      <OrdinancesContent />
    </Suspense>
  );
}

function OrdinancesLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-slate-500 mt-4">Loading ordinances...</p>
      </div>
    </div>
  );
}

function OrdinancesContent() {
  const searchParams = useSearchParams();
  const [ordinances, setOrdinances] = useState<Ordinance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const defaultExpandedYears = useMemo(() => new Set(getRecentYears(2)), []);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(defaultExpandedYears);

  // Initialize search from URL params
  useEffect(() => {
    const search = searchParams.get('search');
    if (search) {
      setSearchTerm(search);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadOrdinances() {
      try {
        const response = await fetch('/api/data?type=ordinances&limit=200');
        const data = await response.json();
        setOrdinances(data.ordinances || []);
      } catch (error) {
        console.error('Failed to load ordinances:', error);
      } finally {
        setLoading(false);
      }
    }

    loadOrdinances();
  }, []);

  // Group ordinances by year
  const ordinancesByYear = ordinances.reduce((acc, ord) => {
    const year = ord.adopted_date?.substring(0, 4) || 'Unknown';
    if (!acc[year]) acc[year] = [];
    acc[year].push(ord);
    return acc;
  }, {} as Record<string, Ordinance[]>);

  // Sort years descending
  const years = Object.keys(ordinancesByYear).sort((a, b) => {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return parseInt(b) - parseInt(a);
  });

  // Filter ordinances by search term
  const filteredOrdinances = searchTerm
    ? ordinances.filter(
        ord =>
          ord.number.includes(searchTerm) ||
          ord.title.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : null;

  const toggleYear = (year: string) => {
    const newExpanded = new Set(expandedYears);
    if (newExpanded.has(year)) {
      newExpanded.delete(year);
    } else {
      newExpanded.add(year);
    }
    setExpandedYears(newExpanded);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center">
            <Scale className="w-8 h-8 mr-3 text-emerald-500" />
            City Ordinances
          </h1>
          <p className="text-slate-600 mt-1">
            Browse adopted ordinances from Flowery Branch
          </p>
        </div>
        <a
          href="https://librarystage.municode.com/ga/flowery_branch/ordinances/code_of_ordinances"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
        >
          Municode Library
          <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ordinance number or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200 mb-6">
        <p className="text-sm text-blue-800">
          <strong>About This Data:</strong> Ordinance information is sourced from the official
          Municode Library. Click on any ordinance to view the full official text. The City of
          Flowery Branch uses Municode to maintain its official Code of Ordinances.
        </p>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-slate-500 mt-4">Loading ordinances...</p>
        </div>
      ) : ordinances.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Scale className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No ordinances found</h3>
          <p className="text-slate-500 mb-4">
            Ordinances haven&apos;t been imported yet.
          </p>
          <p className="text-sm text-slate-400">
            Visit the{' '}
            <a href="/admin" className="text-emerald-600 hover:underline">
              admin panel
            </a>{' '}
            to import ordinances from Municode, or browse the{' '}
            <a
              href="https://librarystage.municode.com/ga/flowery_branch/ordinances/code_of_ordinances"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:underline"
            >
              official Municode library
            </a>
            .
          </p>
        </div>
      ) : filteredOrdinances ? (
        // Search Results
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-900">
              Search Results ({filteredOrdinances.length} found)
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredOrdinances.map((ord) => (
              <OrdinanceRow key={ord.id} ordinance={ord} />
            ))}
          </div>
        </div>
      ) : (
        // Grouped by Year
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
                    {ordinancesByYear[year].length} ordinance{ordinancesByYear[year].length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
              {expandedYears.has(year) && (
                <div className="border-t border-slate-200 divide-y divide-slate-100">
                  {ordinancesByYear[year]
                    .sort((a, b) => parseInt(b.number) - parseInt(a.number))
                    .map((ord) => (
                      <OrdinanceRow key={ord.id} ordinance={ord} />
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrdinanceRow({ ordinance }: { ordinance: Ordinance }) {
  const [showSummary, setShowSummary] = useState(false);
  const [showMeetingHistory, setShowMeetingHistory] = useState(false);
  const [meetings, setMeetings] = useState<MeetingWithAction[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);

  const loadMeetingHistory = async () => {
    if (meetings.length > 0 || loadingMeetings) return;
    setLoadingMeetings(true);
    try {
      const response = await fetch(`/api/data?type=ordinance-meetings&ordinanceId=${ordinance.id}`);
      const data = await response.json();
      setMeetings(data.meetings || []);
    } catch (error) {
      console.error('Failed to load meeting history:', error);
    } finally {
      setLoadingMeetings(false);
    }
  };

  const toggleMeetingHistory = () => {
    if (!showMeetingHistory) {
      loadMeetingHistory();
    }
    setShowMeetingHistory(!showMeetingHistory);
  };

  // Map action types to display labels and colors
  const getActionDisplay = (action: string | null) => {
    const actionMap: Record<string, { label: string; color: string }> = {
      'introduced': { label: 'Introduced', color: 'bg-blue-100 text-blue-700' },
      'first_reading': { label: 'First Reading', color: 'bg-yellow-100 text-yellow-700' },
      'second_reading': { label: 'Second Reading', color: 'bg-orange-100 text-orange-700' },
      'adopted': { label: 'Adopted', color: 'bg-emerald-100 text-emerald-700' },
      'tabled': { label: 'Tabled', color: 'bg-slate-100 text-slate-700' },
      'amended': { label: 'Amended', color: 'bg-purple-100 text-purple-700' },
      'discussed': { label: 'Discussed', color: 'bg-slate-100 text-slate-600' },
    };
    return actionMap[action || 'discussed'] || { label: action || 'Discussed', color: 'bg-slate-100 text-slate-600' };
  };

  return (
    <div className="p-4 hover:bg-slate-50 transition">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              #{ordinance.number}
            </span>
            <h3 className="font-medium text-slate-900">{ordinance.title}</h3>
            {ordinance.summary && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                <Sparkles className="w-3 h-3 mr-1" />
                AI Summary
              </span>
            )}
          </div>
          {ordinance.description && (
            <p className="text-sm text-slate-600 mt-1">{ordinance.description}</p>
          )}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 mt-2">
            <span className="capitalize">{ordinance.status}</span>
            {ordinance.adopted_date && (
              <>
                <span>•</span>
                <span>
                  Adopted: {ordinance.adopted_date.endsWith('-01-01')
                    ? ordinance.adopted_date.substring(0, 4)
                    : new Date(ordinance.adopted_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })
                  }
                </span>
              </>
            )}
            {ordinance.summary && (
              <>
                <span>•</span>
                <button
                  onClick={() => setShowSummary(!showSummary)}
                  className="text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  {showSummary ? 'Hide Summary' : 'Show Summary'}
                </button>
              </>
            )}
            <span>•</span>
            <button
              onClick={toggleMeetingHistory}
              className="text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center"
            >
              <Clock className="w-3 h-3 mr-1" />
              {showMeetingHistory ? 'Hide Meeting History' : 'Meeting History'}
            </button>
          </div>

          {/* AI Summary - collapsible */}
          {showSummary && ordinance.summary && (
            <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div className="flex items-center text-xs text-purple-700 mb-2">
                <Sparkles className="w-3 h-3 mr-1" />
                AI-Generated Summary
              </div>
              <div className="text-sm text-slate-700 space-y-2">
                {ordinance.summary.split('\n').map((paragraph, i) => {
                  // Handle bold text with ** markers
                  const formatted = paragraph.replace(
                    /\*\*([^*]+)\*\*/g,
                    '<strong class="font-semibold text-slate-900">$1</strong>'
                  );
                  return (
                    <p
                      key={i}
                      className="mb-2 last:mb-0"
                      dangerouslySetInnerHTML={{ __html: formatted }}
                    />
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2 italic">
                This summary was generated by AI from the official ordinance PDF.
                Always refer to the official Municode document for authoritative information.
              </p>
            </div>
          )}

          {/* Meeting History - collapsible */}
          {showMeetingHistory && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center text-xs text-blue-700 mb-2 font-medium">
                <Calendar className="w-3 h-3 mr-1" />
                Meeting History
              </div>
              {loadingMeetings ? (
                <div className="flex items-center text-sm text-slate-500">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
                  Loading...
                </div>
              ) : meetings.length > 0 ? (
                <div className="space-y-2">
                  {meetings.map((meeting, index) => {
                    const actionDisplay = getActionDisplay(meeting.action);
                    return (
                      <div key={meeting.id} className="flex items-center text-sm">
                        {/* Timeline connector */}
                        <div className="flex flex-col items-center mr-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${index === meetings.length - 1 ? 'bg-emerald-500' : 'bg-blue-400'}`}></div>
                          {index < meetings.length - 1 && (
                            <div className="w-0.5 h-4 bg-blue-200 mt-0.5"></div>
                          )}
                        </div>
                        <div className="flex-1 flex items-center flex-wrap gap-2">
                          <span className="text-slate-600">
                            {new Date(meeting.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionDisplay.color}`}>
                            {actionDisplay.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No meeting history recorded for this ordinance.</p>
              )}
            </div>
          )}
        </div>
        {ordinance.municode_url && (
          <a
            href={ordinance.municode_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 sm:mt-0 sm:ml-4 inline-flex items-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-700 transition shrink-0"
          >
            <span className="hidden sm:inline">View on Municode</span>
            <span className="sm:hidden">Municode</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
          </a>
        )}
      </div>
    </div>
  );
}
