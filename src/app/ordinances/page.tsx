'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Scale, ExternalLink, Search, ChevronDown, ChevronUp, ChevronRight, Sparkles, Calendar, Clock, FileText, Check, XCircle, PauseCircle } from 'lucide-react';
import { getRecentYears, formatDate } from '@/lib/dates';
import { cityName, municodeUrl, civicClerkUrl } from '@/lib/city-config-client';
import type { PendingOrdinanceWithProgress } from '@/lib/db';

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
  disposition: string | null;  // 'codified' | 'omit' | null
  minutes_url: string | null;  // for administrative ordinances
}

interface MeetingWithAction {
  id: string;
  date: string;
  title: string;
  action: string | null;
}

// Re-export with shorter name for local use
type PendingOrdinance = PendingOrdinanceWithProgress;

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
        <p className="text-slate-500 dark:text-slate-400 mt-4">Loading ordinances...</p>
      </div>
    </div>
  );
}

function OrdinancesContent() {
  const searchParams = useSearchParams();
  const [ordinances, setOrdinances] = useState<Ordinance[]>([]);
  const [pendingOrdinances, setPendingOrdinances] = useState<PendingOrdinance[]>([]);
  const [deniedOrdinances, setDeniedOrdinances] = useState<Ordinance[]>([]);
  const [tabledOrdinances, setTabledOrdinances] = useState<Ordinance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const defaultExpandedYears = useMemo(() => new Set(getRecentYears(2)), []);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(defaultExpandedYears);
  const [autoExpandOrdinance, setAutoExpandOrdinance] = useState<string | null>(null);

  // Initialize search from URL params
  useEffect(() => {
    const search = searchParams.get('search');
    if (search) {
      setSearchTerm(search);
    }
    // Handle expand param for auto-expanding ordinance summary
    const expand = searchParams.get('expand');
    if (expand) {
      setAutoExpandOrdinance(expand);
    }
  }, [searchParams]);

  // Determine which section contains the auto-expand ordinance
  const autoExpandSection = useMemo(() => {
    if (!autoExpandOrdinance) return null;
    if (ordinances.find(o => o.number === autoExpandOrdinance)) return 'adopted';
    if (pendingOrdinances.find(o => o.number === autoExpandOrdinance)) return 'pending';
    if (deniedOrdinances.find(o => o.number === autoExpandOrdinance)) return 'denied';
    if (tabledOrdinances.find(o => o.number === autoExpandOrdinance)) return 'tabled';
    return null;
  }, [autoExpandOrdinance, ordinances, pendingOrdinances, deniedOrdinances, tabledOrdinances]);

  // Auto-expand year and scroll when expand param is set and ordinances are loaded
  useEffect(() => {
    if (autoExpandOrdinance && !loading) {
      // If in adopted section, expand the year
      if (autoExpandSection === 'adopted') {
        const ord = ordinances.find(o => o.number === autoExpandOrdinance);
        if (ord?.adopted_date) {
          const year = ord.adopted_date.substring(0, 4);
          setExpandedYears(prev => new Set([...prev, year]));
        }
      }
      // Scroll to the ordinance after a brief delay for rendering
      setTimeout(() => {
        const element = document.getElementById(`ordinance-${autoExpandOrdinance}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  }, [autoExpandOrdinance, autoExpandSection, ordinances, loading]);

  useEffect(() => {
    async function loadOrdinances() {
      try {
        // Load adopted, pending, denied, and tabled ordinances in parallel
        const [adoptedRes, pendingRes, deniedRes, tabledRes] = await Promise.all([
          fetch('/api/data?type=ordinances&status=adopted&limit=200'),
          fetch('/api/data?type=pending-ordinances'),
          fetch('/api/data?type=ordinances&status=denied'),
          fetch('/api/data?type=ordinances&status=tabled'),
        ]);
        const adoptedData = await adoptedRes.json();
        const pendingData = await pendingRes.json();
        const deniedData = await deniedRes.json();
        const tabledData = await tabledRes.json();
        setOrdinances(adoptedData.ordinances || []);
        setPendingOrdinances(pendingData.ordinances || []);
        setDeniedOrdinances(deniedData.ordinances || []);
        setTabledOrdinances(tabledData.ordinances || []);
      } catch (error) {
        console.error('Failed to load ordinances:', error);
      } finally {
        setLoading(false);
      }
    }

    loadOrdinances();
  }, []);

  // Filter each section by search term (preserves rich UI for each type)
  const filterBySearch = (ord: { number: string; title: string }) =>
    !searchTerm ||
    ord.number.includes(searchTerm) ||
    ord.title.toLowerCase().includes(searchTerm.toLowerCase());

  const filteredAdopted = ordinances.filter(filterBySearch);
  const filteredPending = pendingOrdinances.filter(filterBySearch);
  const filteredDenied = deniedOrdinances.filter(filterBySearch);
  const filteredTabled = tabledOrdinances.filter(filterBySearch);

  const totalMatches = searchTerm
    ? filteredAdopted.length + filteredPending.length + filteredDenied.length + filteredTabled.length
    : 0;

  // Group filtered ordinances by year
  const ordinancesByYear = filteredAdopted.reduce((acc, ord) => {
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
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
            <Scale className="w-8 h-8 mr-3 text-emerald-500" aria-hidden="true" />
            City Ordinances
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Browse adopted ordinances from {cityName}
          </p>
        </div>
        <a
          href={`${municodeUrl}/ordinances/code_of_ordinances`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
        >
          Municode Library
          <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by ordinance number or title..."
            aria-label="Search ordinances"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Search Results Banner */}
      {searchTerm && !loading && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800 mb-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              <strong>{totalMatches}</strong> result{totalMatches !== 1 ? 's' : ''} for &quot;{searchTerm}&quot;
              {filteredPending.length > 0 && <span className="ml-2">• {filteredPending.length} pending</span>}
              {filteredAdopted.length > 0 && <span className="ml-2">• {filteredAdopted.length} adopted</span>}
              {filteredTabled.length > 0 && <span className="ml-2">• {filteredTabled.length} tabled</span>}
              {filteredDenied.length > 0 && <span className="ml-2">• {filteredDenied.length} denied</span>}
            </p>
            <button
              onClick={() => setSearchTerm('')}
              className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium"
            >
              Clear search
            </button>
          </div>
        </div>
      )}

      {/* Pending Legislation Section - appears above adopted ordinances */}
      {!loading && filteredPending.length > 0 && (
        <PendingLegislationSection
          ordinances={filteredPending}
          autoExpand={autoExpandSection === 'pending' ? autoExpandOrdinance : null}
        />
      )}

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-6 border border-blue-200 dark:border-blue-800 mb-6">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>About This Data:</strong> Pending legislation is sourced from City Council meeting
          agendas. Adopted ordinances link to the official Municode Library where the City of {cityName} maintains its Code of Ordinances.
        </p>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="text-center py-12" role="status" aria-live="polite">
          <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto" aria-hidden="true"></div>
          <p className="text-slate-500 dark:text-slate-400 mt-4">Loading ordinances...</p>
        </div>
      ) : ordinances.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Scale className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No ordinances found</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            Ordinances haven&apos;t been imported yet.
          </p>
          <p className="text-sm text-slate-400">
            Visit the{' '}
            <a href="/admin" className="text-emerald-600 dark:text-emerald-400 hover:underline">
              admin panel
            </a>{' '}
            to import ordinances from Municode, or browse the{' '}
            <a
              href={`${municodeUrl}/ordinances/code_of_ordinances`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              official Municode library
            </a>
            .
          </p>
        </div>
      ) : filteredAdopted.length > 0 ? (
        // Grouped by Year
        <div className="space-y-4">
          {years.map((year) => (
            <div
              key={year}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              <button
                onClick={() => toggleYear(year)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                <div className="flex items-center">
                  {expandedYears.has(year) ? (
                    <ChevronDown className="w-5 h-5 text-slate-400 mr-2" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400 mr-2" />
                  )}
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{year}</h2>
                  <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">
                    {ordinancesByYear[year].length} ordinance{ordinancesByYear[year].length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
              {expandedYears.has(year) && (
                <div className="border-t border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                  {ordinancesByYear[year]
                    .sort((a, b) => parseInt(b.number) - parseInt(a.number))
                    .map((ord) => (
                      <OrdinanceRow
                        key={ord.id}
                        ordinance={ord}
                        autoExpand={autoExpandOrdinance === ord.number}
                      />
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !searchTerm ? null : (
        // No adopted matches during search - show nothing for this section
        null
      )}

      {/* Tabled Legislation Section - above denied */}
      {!loading && filteredTabled.length > 0 && (
        <TabledLegislationSection
          ordinances={filteredTabled}
          autoExpand={autoExpandSection === 'tabled' ? autoExpandOrdinance : null}
          forceExpand={!!searchTerm}
        />
      )}

      {/* Denied/Rejected Legislation Section - at bottom */}
      {!loading && filteredDenied.length > 0 && (
        <DeniedLegislationSection
          ordinances={filteredDenied}
          autoExpand={autoExpandSection === 'denied' ? autoExpandOrdinance : null}
          forceExpand={!!searchTerm}
        />
      )}
    </div>
  );
}

function OrdinanceRow({ ordinance, autoExpand = false }: { ordinance: Ordinance; autoExpand?: boolean }) {
  const [showSummary, setShowSummary] = useState(autoExpand && !!ordinance.summary);
  const [showMeetingHistory, setShowMeetingHistory] = useState(autoExpand);
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

  // Auto-load meeting history when auto-expanding
  useEffect(() => {
    if (autoExpand) {
      loadMeetingHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map action types to display labels and colors
  const getActionDisplay = (action: string | null) => {
    const actionMap: Record<string, { label: string; color: string }> = {
      'introduced': { label: 'Introduced', color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' },
      'first_reading': { label: 'First Reading', color: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' },
      'second_reading': { label: 'Second Reading', color: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300' },
      'adopted': { label: 'Adopted', color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' },
      'tabled': { label: 'Tabled', color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
      'amended': { label: 'Amended', color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' },
      'discussed': { label: 'Discussed', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' },
      'denied': { label: 'Denied', color: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' },
      'rejected': { label: 'Rejected', color: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' },
    };
    return actionMap[action || 'discussed'] || { label: action || 'Discussed', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' };
  };

  return (
    <div
      id={`ordinance-${ordinance.number}`}
      className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition ${autoExpand ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-200 dark:ring-emerald-800' : ''}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
              #{ordinance.number}
            </span>
            <h3 className="font-medium text-slate-900 dark:text-slate-100">{ordinance.title}</h3>
            {ordinance.disposition === 'omit' && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 cursor-help"
                title="Administrative ordinance - one-time action not added to the permanent Municipal Code"
              >
                Administrative
              </span>
            )}
            {ordinance.summary && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                <Sparkles className="w-3 h-3 mr-1" />
                AI Summary
              </span>
            )}
          </div>
          {ordinance.description && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{ordinance.description}</p>
          )}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-2">
            <span className="capitalize">{ordinance.status}</span>
            {ordinance.adopted_date && (
              <>
                <span>•</span>
                <span>
                  Adopted: {ordinance.adopted_date.endsWith('-01-01')
                    ? ordinance.adopted_date.substring(0, 4)
                    : formatDate(ordinance.adopted_date)
                  }
                </span>
              </>
            )}
            <span>•</span>
            <button
              onClick={toggleMeetingHistory}
              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium inline-flex items-center"
            >
              <Clock className="w-3 h-3 mr-1" />
              {showMeetingHistory ? 'Hide Meeting History' : 'Meeting History'}
            </button>
          </div>

          {/* Summary Toggle Button */}
          {ordinance.summary && (
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 transition border border-slate-200 dark:border-slate-600"
            >
              <Sparkles className="w-4 h-4 text-purple-500" />
              {showSummary ? 'Hide AI Summary' : 'Show AI Summary'}
              {showSummary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}

          {/* AI Summary - collapsible */}
          {showSummary && ordinance.summary && (
            <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-100 dark:border-purple-800">
              <div className="flex items-center text-xs text-purple-700 dark:text-purple-300 mb-2">
                <Sparkles className="w-3 h-3 mr-1" />
                AI-Generated Summary
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2">
                {ordinance.summary.split('\n').map((paragraph, i) => {
                  // Handle bold text with ** markers
                  const formatted = paragraph.replace(
                    /\*\*([^*]+)\*\*/g,
                    '<strong class="font-semibold text-slate-900 dark:text-slate-100">$1</strong>'
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
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                This summary was generated by AI from the official ordinance PDF.
                Always refer to the official Municode document for authoritative information.
              </p>
            </div>
          )}

          {/* Meeting History - collapsible */}
          {showMeetingHistory && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
              <div className="flex items-center text-xs text-blue-700 dark:text-blue-300 mb-2 font-medium">
                <Calendar className="w-3 h-3 mr-1" />
                Meeting History
              </div>
              {loadingMeetings ? (
                <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
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
                            <div className="w-0.5 h-4 bg-blue-200 dark:bg-blue-700 mt-0.5"></div>
                          )}
                        </div>
                        <div className="flex-1 flex items-center flex-wrap gap-2">
                          <Link
                            href={`/meetings?expand=${meeting.id}&section=ordinances`}
                            className="text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline"
                          >
                            {formatDate(meeting.date)}
                          </Link>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionDisplay.color}`}>
                            {actionDisplay.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  <p className="mb-2">No meeting record in our database.</p>
                  <div className="flex items-center gap-3">
                    <a
                      href={civicClerkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      Search CivicClerk
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                    {ordinance.municode_url && (
                      <a
                        href={ordinance.municode_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                      >
                        View on Municode
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Link to source document - Municode for codified, Minutes for administrative */}
        {ordinance.disposition === 'omit' ? (
          ordinance.minutes_url ? (
            <a
              href={ordinance.minutes_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 sm:mt-0 sm:ml-4 inline-flex items-center px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 transition shrink-0"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              <span className="hidden sm:inline">View Minutes</span>
              <span className="sm:hidden">Minutes</span>
              <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          ) : (
            <span className="mt-3 sm:mt-0 sm:ml-4 inline-flex items-center px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-400 shrink-0">
              <span className="hidden sm:inline">No Municode page</span>
              <span className="sm:hidden">Admin</span>
            </span>
          )
        ) : ordinance.municode_url ? (
          <a
            href={ordinance.municode_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 sm:mt-0 sm:ml-4 inline-flex items-center px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 transition shrink-0"
          >
            <span className="hidden sm:inline">View on Municode</span>
            <span className="sm:hidden">Municode</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

// Pending Legislation Section - shows ordinances that haven't been adopted yet
function PendingLegislationSection({ ordinances, autoExpand }: { ordinances: PendingOrdinance[]; autoExpand: string | null }) {
  if (ordinances.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl shadow-sm border border-amber-200 dark:border-amber-800 p-6 mb-6">
      <div className="flex items-center mb-4">
        <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-2" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pending Legislation</h2>
        <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">
          {ordinances.length} in progress
        </span>
      </div>

      <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
        These ordinances are currently being considered by City Council. They require multiple
        readings before adoption and may change during the review process.
      </p>

      <div className="space-y-4">
        {ordinances.map(ord => (
          <PendingOrdinanceCard key={ord.id} ordinance={ord} highlighted={autoExpand === ord.number} />
        ))}
      </div>
    </div>
  );
}

// Progress steps for ordinance adoption
const PROGRESS_STEPS = [
  { key: 'first_reading', label: 'First Reading' },
  { key: 'second_reading', label: 'Second Reading' },
  { key: 'adopted', label: 'Adopted' },
];

function PendingOrdinanceCard({ ordinance, highlighted }: { ordinance: PendingOrdinance; highlighted?: boolean }) {
  const [showSummary, setShowSummary] = useState(false);

  // Determine completed steps from readings
  const completedActions = new Set(ordinance.readings.map(r => r.action));

  // Get status display
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'first_reading':
        return { label: 'First Reading Complete', color: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200' };
      case 'second_reading':
        return { label: 'Awaiting Adoption', color: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200' };
      default:
        return { label: 'Introduced', color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200' };
    }
  };

  const statusDisplay = getStatusDisplay(ordinance.status);

  return (
    <div
      id={`ordinance-${ordinance.number}`}
      className={`bg-white dark:bg-slate-800 rounded-lg p-4 border border-amber-100 dark:border-amber-800/50 shadow-sm ${highlighted ? 'ring-2 ring-amber-400 dark:ring-amber-500 ring-offset-2 dark:ring-offset-slate-900' : ''}`}
    >
      {/* Header with ordinance number and title */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
              #{ordinance.number}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusDisplay.color}`}>
              {statusDisplay.label}
            </span>
          </div>
          <h3 className="font-medium text-slate-900 dark:text-slate-100 mt-2">{ordinance.title}</h3>
        </div>
      </div>

      {/* Progress Timeline */}
      <div className="mt-4">
        <ProgressTimeline completedActions={completedActions} />
      </div>

      {/* Next Action */}
      {ordinance.next_meeting && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center text-sm text-blue-800 dark:text-blue-200">
              <Calendar className="w-4 h-4 mr-2 shrink-0" />
              <span className="font-medium">Next:</span>
              <span className="ml-1">{ordinance.next_meeting.expected_action}</span>
              <span className="mx-1.5">-</span>
              <span>
                {new Date(ordinance.next_meeting.date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            {ordinance.next_meeting.packet_url && (
              <a
                href={ordinance.next_meeting.packet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                <FileText className="w-3.5 h-3.5 mr-1" />
                View Packet
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Past Readings */}
      {ordinance.readings.length > 0 && (
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium">History:</span>{' '}
          {ordinance.readings.map((r, i) => (
            <span key={r.meeting_id}>
              {i > 0 && ' → '}
              <Link
                href={`/meetings?expand=${r.meeting_id}&section=ordinances`}
                className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline"
              >
                {r.action.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} (
                {new Date(r.meeting_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
              </Link>
            </span>
          ))}
        </div>
      )}

      {/* AI Summary Toggle */}
      {ordinance.summary && (
        <>
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 transition border border-slate-200 dark:border-slate-600"
          >
            <Sparkles className="w-4 h-4 text-purple-500" />
            {showSummary ? 'Hide Summary' : 'What would this change?'}
            {showSummary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showSummary && (
            <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-100 dark:border-purple-800">
              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {ordinance.summary}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                AI-generated summary. View the meeting packet for official language.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProgressTimeline({ completedActions }: { completedActions: Set<string> }) {
  return (
    <div className="flex items-center">
      {PROGRESS_STEPS.map((step, index) => {
        const isCompleted = completedActions.has(step.key);
        const isNext = !isCompleted &&
          (index === 0 || completedActions.has(PROGRESS_STEPS[index - 1].key));

        return (
          <div key={step.key} className="flex items-center flex-1">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                  ${isCompleted
                    ? 'bg-emerald-500 text-white'
                    : isNext
                      ? 'bg-amber-500 text-white ring-2 ring-amber-200 dark:ring-amber-700'
                      : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400'}
                `}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : index + 1}
              </div>
              <span className={`mt-1 text-xs whitespace-nowrap ${isCompleted ? 'text-slate-700 dark:text-slate-200 font-medium' : 'text-slate-400'}`}>
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < PROGRESS_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${
                isCompleted ? 'bg-emerald-300 dark:bg-emerald-600' : 'bg-slate-200 dark:bg-slate-600'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Tabled Legislation Section - shows ordinances that were tabled
function TabledLegislationSection({ ordinances, autoExpand, forceExpand }: { ordinances: Ordinance[]; autoExpand: string | null; forceExpand?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(!!autoExpand || !!forceExpand);

  if (ordinances.length === 0) return null;

  return (
    <div className="mt-6 bg-amber-50 dark:bg-amber-900/30 rounded-xl shadow-sm border border-amber-200 dark:border-amber-800 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition"
      >
        <div className="flex items-center">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-amber-500 mr-2" />
          ) : (
            <ChevronRight className="w-5 h-5 text-amber-500 mr-2" />
          )}
          <PauseCircle className="w-5 h-5 text-amber-500 mr-2" />
          <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200">Tabled Legislation</h2>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-200">
            {ordinances.length}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-amber-200 dark:border-amber-800">
          <p className="px-4 py-3 text-sm text-amber-700 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/50 border-b border-amber-200 dark:border-amber-800">
            These ordinances were tabled (postponed) and may be revisited in a future meeting.
          </p>
          <div className="divide-y divide-amber-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {ordinances.map((ord) => (
              <TabledOrdinanceRow
                key={ord.id}
                ordinance={ord}
                highlighted={autoExpand === ord.number}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabledOrdinanceRow({ ordinance, highlighted }: { ordinance: Ordinance; highlighted?: boolean }) {
  const [meetings, setMeetings] = useState<MeetingWithAction[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadMeetingHistory = async () => {
    if (loaded || loadingMeetings) return;
    setLoadingMeetings(true);
    try {
      const response = await fetch(`/api/data?type=ordinance-meetings&ordinanceId=${ordinance.id}`);
      const data = await response.json();
      setMeetings(data.meetings || []);
      setLoaded(true);
    } catch (error) {
      console.error('Failed to load meeting history:', error);
    } finally {
      setLoadingMeetings(false);
    }
  };

  useEffect(() => {
    loadMeetingHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tablingMeeting = meetings.find(m => m.action === 'tabled');

  return (
    <div
      id={`ordinance-${ordinance.number}`}
      className={`p-4 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition ${highlighted ? 'bg-amber-100 dark:bg-amber-900/50 ring-2 ring-amber-300 dark:ring-amber-600' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
              #{ordinance.number}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">
              Tabled
            </span>
            <h3 className="font-medium text-slate-700 dark:text-slate-200">{ordinance.title}</h3>
          </div>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-2">
            {loadingMeetings ? (
              <span className="flex items-center">
                <div className="animate-spin w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full mr-1"></div>
                Loading...
              </span>
            ) : tablingMeeting ? (
              <>
                <span>Tabled:</span>
                <Link
                  href={`/meetings?expand=${tablingMeeting.id}&section=ordinances`}
                  className="text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 hover:underline"
                >
                  {formatDate(tablingMeeting.date)}
                </Link>
              </>
            ) : (
              <span>Status: Tabled</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Denied/Rejected Legislation Section - shows ordinances that didn't pass
function DeniedLegislationSection({ ordinances, autoExpand, forceExpand }: { ordinances: Ordinance[]; autoExpand: string | null; forceExpand?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(!!autoExpand || !!forceExpand);

  if (ordinances.length === 0) return null;

  return (
    <div className="mt-6 bg-slate-50 dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
      >
        <div className="flex items-center">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-slate-400 mr-2" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400 mr-2" />
          )}
          <XCircle className="w-5 h-5 text-slate-400 mr-2" />
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Denied/Rejected Legislation</h2>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">
            {ordinances.length}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
            These ordinances were considered but not adopted by City Council.
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {ordinances.map((ord) => (
              <DeniedOrdinanceRow
                key={ord.id}
                ordinance={ord}
                highlighted={autoExpand === ord.number}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeniedOrdinanceRow({ ordinance, highlighted }: { ordinance: Ordinance; highlighted?: boolean }) {
  const [meetings, setMeetings] = useState<MeetingWithAction[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadMeetingHistory = async () => {
    if (loaded || loadingMeetings) return;
    setLoadingMeetings(true);
    try {
      const response = await fetch(`/api/data?type=ordinance-meetings&ordinanceId=${ordinance.id}`);
      const data = await response.json();
      setMeetings(data.meetings || []);
      setLoaded(true);
    } catch (error) {
      console.error('Failed to load meeting history:', error);
    } finally {
      setLoadingMeetings(false);
    }
  };

  // Load meeting history on mount
  useEffect(() => {
    loadMeetingHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Find the denial meeting
  const denialMeeting = meetings.find(m => m.action === 'denied' || m.action === 'rejected');

  return (
    <div
      id={`ordinance-${ordinance.number}`}
      className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition ${highlighted ? 'bg-red-50 dark:bg-red-900/30 ring-2 ring-red-200 dark:ring-red-800' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300">
              #{ordinance.number}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
              Denied
            </span>
            <h3 className="font-medium text-slate-700 dark:text-slate-200">{ordinance.title}</h3>
          </div>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-2">
            {loadingMeetings ? (
              <span className="flex items-center">
                <div className="animate-spin w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full mr-1"></div>
                Loading...
              </span>
            ) : denialMeeting ? (
              <>
                <span>Denied:</span>
                <Link
                  href={`/meetings?expand=${denialMeeting.id}&section=ordinances`}
                  className="text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:underline"
                >
                  {formatDate(denialMeeting.date)}
                </Link>
              </>
            ) : (
              <span>Status: Denied</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
