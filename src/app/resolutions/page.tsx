'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, ExternalLink, Search, ChevronDown, ChevronRight, Sparkles, Calendar, Package } from 'lucide-react';
import { getRecentYears } from '@/lib/dates';

interface Resolution {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  introduced_date: string | null;
  adopted_date: string | null;
  meeting_id: string | null;
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
        <p className="text-slate-500 mt-4">Loading resolutions...</p>
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

  // Initialize search from URL params
  useEffect(() => {
    const search = searchParams.get('search');
    if (search) {
      setSearchTerm(search);
    }
  }, [searchParams]);

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

  // Group resolutions by year
  const resolutionsByYear = resolutions.reduce((acc, res) => {
    const year = res.adopted_date?.substring(0, 4) || res.introduced_date?.substring(0, 4) || 'Unknown';
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
          <h1 className="text-3xl font-bold text-slate-900 flex items-center">
            <FileText className="w-8 h-8 mr-3 text-purple-500" />
            City Resolutions
          </h1>
          <p className="text-slate-600 mt-1">
            Browse resolutions passed by Flowery Branch City Council
          </p>
        </div>
        <a
          href="https://flowerybranchga.portal.civicclerk.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
        >
          CivicClerk Portal
          <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by resolution number or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-purple-50 rounded-xl p-6 border border-purple-200 mb-6">
        <p className="text-sm text-purple-800">
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
          <p className="text-slate-500 mt-4">Loading resolutions...</p>
        </div>
      ) : resolutions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No resolutions found</h3>
          <p className="text-slate-500 mb-4">
            Resolutions haven&apos;t been extracted yet.
          </p>
          <p className="text-sm text-slate-400">
            Visit the{' '}
            <a href="/admin" className="text-purple-600 hover:underline">
              admin panel
            </a>{' '}
            to extract resolutions from meeting agendas, or browse the{' '}
            <a
              href="https://flowerybranchga.portal.civicclerk.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:underline"
            >
              CivicClerk Portal
            </a>
            .
          </p>
        </div>
      ) : filteredResolutions ? (
        // Search Results
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="font-semibold text-slate-900">
              Search Results ({filteredResolutions.length} found)
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredResolutions.map((res) => (
              <ResolutionRow key={res.id} resolution={res} />
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
                    {resolutionsByYear[year].length} resolution{resolutionsByYear[year].length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
              {expandedYears.has(year) && (
                <div className="border-t border-slate-200 divide-y divide-slate-100">
                  {resolutionsByYear[year]
                    .sort((a, b) => {
                      // Sort by number descending (e.g., 26-001 > 25-015)
                      return b.number.localeCompare(a.number);
                    })
                    .map((res) => (
                      <ResolutionRow key={res.id} resolution={res} />
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

function ResolutionRow({ resolution }: { resolution: Resolution }) {
  const [showSummary, setShowSummary] = useState(false);

  // Get status display info
  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      'adopted': { label: 'Adopted', color: 'bg-emerald-100 text-emerald-700' },
      'proposed': { label: 'Proposed', color: 'bg-blue-100 text-blue-700' },
      'tabled': { label: 'Tabled', color: 'bg-slate-100 text-slate-700' },
      'rejected': { label: 'Rejected', color: 'bg-red-100 text-red-700' },
    };
    return statusMap[status] || { label: status, color: 'bg-slate-100 text-slate-600' };
  };

  const statusDisplay = getStatusDisplay(resolution.status);
  const displayDate = resolution.adopted_date || resolution.introduced_date;

  return (
    <div className="p-4 hover:bg-slate-50 transition">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              #{resolution.number}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusDisplay.color}`}>
              {statusDisplay.label}
            </span>
            <h3 className="font-medium text-slate-900">{resolution.title}</h3>
            {resolution.summary && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                <Sparkles className="w-3 h-3 mr-1" />
                AI Summary
              </span>
            )}
          </div>
          {resolution.description && (
            <p className="text-sm text-slate-600 mt-1">{resolution.description}</p>
          )}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 mt-2">
            {displayDate && (
              <span className="flex items-center">
                <Calendar className="w-3 h-3 mr-1" />
                {new Date(displayDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            )}
            {resolution.summary && (
              <>
                <span>•</span>
                <button
                  onClick={() => setShowSummary(!showSummary)}
                  className="text-purple-600 hover:text-purple-700 font-medium"
                >
                  {showSummary ? 'Hide Summary' : 'Show Summary'}
                </button>
              </>
            )}
            {resolution.meeting_id && (
              <>
                <span>•</span>
                <Link
                  href={`/timeline?date=${displayDate}`}
                  className="text-purple-600 hover:text-purple-700 font-medium"
                >
                  View in timeline
                </Link>
              </>
            )}
          </div>

          {/* AI Summary - collapsible */}
          {showSummary && resolution.summary && (
            <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div className="flex items-center text-xs text-purple-700 mb-2">
                <Sparkles className="w-3 h-3 mr-1" />
                AI-Generated Summary
              </div>
              <div className="text-sm text-slate-700 space-y-2">
                {resolution.summary.split('\n').map((paragraph, i) => {
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
            className="mt-3 sm:mt-0 sm:ml-4 inline-flex items-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-700 transition shrink-0"
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
