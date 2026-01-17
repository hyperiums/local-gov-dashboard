'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, ExternalLink, Search, ChevronDown, ChevronUp, ChevronRight, Sparkles, Calendar, Package } from 'lucide-react';
import { getRecentYears, formatDate } from '@/lib/dates';
import { civicClerkUrl, cityName } from '@/lib/city-config-client';
import { formatAndSanitize } from '@/lib/sanitize';

interface Resolution {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  introduced_date: string | null;
  adopted_date: string | null;
  meeting_id: string | null;
  meeting_date: string | null;
  packet_url: string | null;
  summary: string | null;
}

export default function ResolutionsPage() {
  return (
    <Suspense fallback={<ResolutionsLoading />}>
      <ResolutionsContent />
    </Suspense>
  );
}

function ResolutionsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-slate-500 dark:text-slate-400 mt-4">Loading resolutions...</p>
      </div>
    </div>
  );
}

function ResolutionsContent() {
  const searchParams = useSearchParams();
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const defaultExpandedYears = useMemo(() => new Set(getRecentYears(2)), []);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(defaultExpandedYears);
  const [autoExpandResolution, setAutoExpandResolution] = useState<string | null>(null);

  // Initialize search from URL params
  useEffect(() => {
    const search = searchParams.get('search');
    if (search) {
      setSearchTerm(search);
    }
    // Handle expand param for auto-expanding resolution summary
    const expand = searchParams.get('expand');
    if (expand) {
      setAutoExpandResolution(expand);
    }
  }, [searchParams]);

  // Auto-expand year and scroll when expand param is set and resolutions are loaded
  useEffect(() => {
    if (autoExpandResolution && resolutions.length > 0) {
      const res = resolutions.find(r => r.number === autoExpandResolution);
      const date = res?.meeting_date || res?.adopted_date || res?.introduced_date;
      if (date) {
        const year = date.substring(0, 4);
        setExpandedYears(prev => new Set([...prev, year]));
      }
      // Scroll to the resolution after a brief delay for rendering
      setTimeout(() => {
        const element = document.getElementById(`resolution-${autoExpandResolution}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  }, [autoExpandResolution, resolutions]);

  useEffect(() => {
    async function loadResolutions() {
      try {
        const response = await fetch('/api/data?type=resolutions&limit=200');
        const data = await response.json();
        setResolutions(data.resolutions || []);
      } catch (error) {
        console.error('Failed to load resolutions:', error);
      } finally {
        setLoading(false);
      }
    }

    loadResolutions();
  }, []);

  // Group resolutions by year (prefer meeting_date for most recent activity)
  const resolutionsByYear = resolutions.reduce((acc, res) => {
    const year = res.meeting_date?.substring(0, 4) || res.adopted_date?.substring(0, 4) || res.introduced_date?.substring(0, 4) || 'Unknown';
    if (!acc[year]) acc[year] = [];
    acc[year].push(res);
    return acc;
  }, {} as Record<string, Resolution[]>);

  // Sort years descending
  const years = Object.keys(resolutionsByYear).sort((a, b) => {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return parseInt(b) - parseInt(a);
  });

  // Filter resolutions by search term
  const filteredResolutions = searchTerm
    ? resolutions.filter(
        res =>
          res.number.includes(searchTerm) ||
          res.title.toLowerCase().includes(searchTerm.toLowerCase())
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
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
            <FileText className="w-8 h-8 mr-3 text-purple-500" aria-hidden="true" />
            City Resolutions
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Browse resolutions passed by {cityName} City Council
          </p>
        </div>
        <a
          href={civicClerkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
        >
          CivicClerk Portal
          <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by resolution number or title..."
            aria-label="Search resolutions"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-purple-50 dark:bg-purple-900/30 rounded-xl p-6 border border-purple-200 dark:border-purple-800 mb-6">
        <p className="text-sm text-purple-800 dark:text-purple-200">
          <strong>About Resolutions:</strong> Unlike ordinances (which establish ongoing laws), resolutions
          are formal expressions of the City Council&apos;s opinion, will, or intent. They are often used for
          approving contracts, recognizing achievements, or authorizing specific actions. Full resolution
          text can be found in meeting packets on the CivicClerk Portal.
        </p>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-slate-500 dark:text-slate-400 mt-4">Loading resolutions...</p>
        </div>
      ) : resolutions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
          <FileText className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No resolutions found</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            Resolutions haven&apos;t been extracted yet.
          </p>
          <p className="text-sm text-slate-400">
            Visit the{' '}
            <a href="/admin" className="text-purple-600 dark:text-purple-400 hover:underline">
              admin panel
            </a>{' '}
            to extract resolutions from meeting agendas, or browse the{' '}
            <a
              href={civicClerkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 dark:text-purple-400 hover:underline"
            >
              CivicClerk Portal
            </a>
            .
          </p>
        </div>
      ) : filteredResolutions ? (
        // Search Results
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              Search Results ({filteredResolutions.length} found)
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredResolutions.map((res) => (
              <ResolutionRow
                key={res.id}
                resolution={res}
                autoExpand={autoExpandResolution === res.number}
              />
            ))}
          </div>
        </div>
      ) : (
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
                    {resolutionsByYear[year].length} resolution{resolutionsByYear[year].length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
              {expandedYears.has(year) && (
                <div className="border-t border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                  {resolutionsByYear[year]
                    .sort((a, b) => {
                      // Sort by number descending (e.g., 26-001 > 25-015)
                      return b.number.localeCompare(a.number);
                    })
                    .map((res) => (
                      <ResolutionRow
                        key={res.id}
                        resolution={res}
                        autoExpand={autoExpandResolution === res.number}
                      />
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

function ResolutionRow({ resolution, autoExpand = false }: { resolution: Resolution; autoExpand?: boolean }) {
  const [showSummary, setShowSummary] = useState(autoExpand && !!resolution.summary);

  // Get status display info
  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      'adopted': { label: 'Adopted', color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' },
      'proposed': { label: 'Proposed', color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' },
      'pending_minutes': { label: 'Pending Minutes', color: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300' },
      'tabled': { label: 'Tabled', color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
      'rejected': { label: 'Rejected', color: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' },
    };
    return statusMap[status] || { label: status, color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' };
  };

  const statusDisplay = getStatusDisplay(resolution.status);
  // For timeline links, prefer meeting_date (when this resolution was last discussed)
  const timelineDate = resolution.meeting_date || resolution.adopted_date || resolution.introduced_date;
  // Check if we have different dates worth showing
  const introducedDate = resolution.introduced_date;
  const meetingDate = resolution.meeting_date;
  const adoptedDate = resolution.adopted_date;
  const showBothDates = meetingDate && introducedDate && meetingDate !== introducedDate;

  return (
    <div
      id={`resolution-${resolution.number}`}
      className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition ${autoExpand ? 'bg-purple-50 dark:bg-purple-900/30 ring-2 ring-purple-200 dark:ring-purple-800' : ''}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300">
              #{resolution.number}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusDisplay.color}`}>
              {statusDisplay.label}
            </span>
            <h3 className="font-medium text-slate-900 dark:text-slate-100">{resolution.title}</h3>
            {resolution.summary && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                <Sparkles className="w-3 h-3 mr-1" />
                AI Summary
              </span>
            )}
          </div>
          {resolution.description && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{resolution.description}</p>
          )}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-2">
            <Calendar className="w-3 h-3" />
            {resolution.status === 'adopted' && adoptedDate ? (
              <span>{formatDate(adoptedDate)}</span>
            ) : showBothDates ? (
              <>
                <span>Last discussed {formatDate(meetingDate)}</span>
                <span>•</span>
                <span className="text-slate-400">First introduced {formatDate(introducedDate)}</span>
              </>
            ) : (
              <span>{formatDate(timelineDate || '')}</span>
            )}
            {resolution.meeting_id && timelineDate && (
              <>
                <span>•</span>
                <Link
                  href={`/timeline?date=${timelineDate}`}
                  className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
                >
                  View in timeline
                </Link>
              </>
            )}
          </div>

          {/* Summary Toggle Button */}
          {resolution.summary && (
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
          {showSummary && resolution.summary && (
            <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-100 dark:border-purple-800">
              <div className="flex items-center text-xs text-purple-700 dark:text-purple-300 mb-2">
                <Sparkles className="w-3 h-3 mr-1" />
                AI-Generated Summary
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2">
                {resolution.summary.split('\n').map((paragraph, i) => (
                  <p
                    key={i}
                    className="mb-2 last:mb-0"
                    dangerouslySetInnerHTML={{ __html: formatAndSanitize(paragraph) }}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                This summary was generated by AI. Refer to the official meeting packet for authoritative information.
              </p>
            </div>
          )}
        </div>
        {resolution.packet_url && (
          <a
            href={resolution.packet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 sm:mt-0 sm:ml-4 inline-flex items-center px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 transition shrink-0"
          >
            <Package className="w-3.5 h-3.5 mr-1.5" />
            <span className="hidden sm:inline">Meeting Packet</span>
            <span className="sm:hidden">Packet</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
          </a>
        )}
      </div>
    </div>
  );
}
