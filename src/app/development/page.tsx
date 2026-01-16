'use client';

import { useState, useEffect, useMemo } from 'react';
import { Building2, ExternalLink, FileText, Sparkles, ChevronDown, ChevronRight, TrendingUp, BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

interface MonthlySummary {
  month: string;
  summary: string;
  pdfUrl?: string | null;
}

interface ChartData {
  monthly: { month: string; count: number; total_value: number }[];
  byType: { type: string; count: number }[];
  yearOverYear: { year: string; monthNum: string; count: number }[];
  years: string[];
  totals: { permits: number; months: number };
}

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Month name mappings for PDF URLs
const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'June', '07': 'July', '08': 'Aug',
  '09': 'Sept', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function getPermitPdfUrl(month: string): string {
  // Handle YYYY-MM format
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const [, year, monthNum] = match;
    const monthName = MONTH_NAMES[monthNum] || 'Jan';
    return `https://www.flowerybranchga.org/${monthName}${year}permitlisting.pdf`;
  }

  // Handle formats like "jan-2025-permits"
  const yearMatch = month.match(/(\d{4})/);
  const monthMatch = month.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
  if (yearMatch && monthMatch) {
    const monthName = monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1).toLowerCase();
    // Map short names to PDF format
    const pdfMonthNames: Record<string, string> = {
      Jan: 'Jan', Feb: 'Feb', Mar: 'Mar', Apr: 'Apr', May: 'May', Jun: 'June',
      Jul: 'July', Aug: 'Aug', Sep: 'Sept', Oct: 'Oct', Nov: 'Nov', Dec: 'Dec'
    };
    return `https://www.flowerybranchga.org/${pdfMonthNames[monthName] || monthName}${yearMatch[1]}permitlisting.pdf`;
  }

  return `https://www.flowerybranchga.org/permits`;
}

function getBusinessPdfUrl(month: string): string {
  // Handle YYYY-MM format
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const [, year, monthNum] = match;
    const monthName = MONTH_NAMES[monthNum] || 'Jan';
    return `https://www.flowerybranchga.org/${monthName}${year}businesslisting.pdf`;
  }

  // Handle formats like "jan-2025-businesses"
  const yearMatch = month.match(/(\d{4})/);
  const monthMatch = month.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
  if (yearMatch && monthMatch) {
    const monthName = monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1).toLowerCase();
    const pdfMonthNames: Record<string, string> = {
      Jan: 'Jan', Feb: 'Feb', Mar: 'Mar', Apr: 'Apr', May: 'May', Jun: 'June',
      Jul: 'July', Aug: 'Aug', Sep: 'Sept', Oct: 'Oct', Nov: 'Nov', Dec: 'Dec'
    };
    return `https://www.flowerybranchga.org/${pdfMonthNames[monthName] || monthName}${yearMatch[1]}businesslisting.pdf`;
  }

  return `https://www.flowerybranchga.org/business`;
}

export default function DevelopmentPage() {
  const [permitSummaries, setPermitSummaries] = useState<MonthlySummary[]>([]);
  const [businessSummaries, setBusinessSummaries] = useState<MonthlySummary[]>([]);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'permits' | 'businesses'>('permits');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [selectedChartYears, setSelectedChartYears] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState<string>('all');
  const [chartsExpanded, setChartsExpanded] = useState(false);

  // Handle URL hash for tab navigation
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'businesses') {
      setActiveTab('businesses');
    } else if (hash === 'permits') {
      setActiveTab('permits');
    }
  }, []);

  // Update hash when tab changes
  const handleTabChange = (tab: 'permits' | 'businesses') => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };

  useEffect(() => {
    async function loadData() {
      try {
        // Load summaries and chart data in parallel
        const [summariesRes, chartRes] = await Promise.all([
          fetch('/api/data?type=development-summaries'),
          fetch('/api/data?type=permit-chart-data'),
        ]);

        const summariesData = await summariesRes.json();
        const chartDataRes = await chartRes.json();

        setPermitSummaries(summariesData.permits || []);
        setBusinessSummaries(summariesData.businesses || []);
        setChartData(chartDataRes);

        // Select last 3 years for year-over-year chart by default
        if (chartDataRes.years?.length > 0) {
          const recentYears = chartDataRes.years.slice(-3);
          setSelectedChartYears(recentYears);
        }

        // Auto-expand the two most recent months
        const recentPermitMonths = (summariesData.permits || []).slice(0, 2).map((s: MonthlySummary) => s.month);
        setExpandedMonths(new Set(recentPermitMonths));
      } catch (error) {
        console.error('Failed to load development data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const toggleMonth = (month: string) => {
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(month)) {
      newExpanded.delete(month);
    } else {
      newExpanded.add(month);
    }
    setExpandedMonths(newExpanded);
  };

  const formatMonth = (month: string) => {
    if (!month || month === 'Unknown') return 'Unknown Date';

    // Handle YYYY-MM format
    const match = month.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const [, year, monthNum] = match;
      const date = new Date(parseInt(year), parseInt(monthNum) - 1);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    // Handle other formats like "jan-2025-permits" - extract what we can
    const yearMatch = month.match(/(\d{4})/);
    const monthMatch = month.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (yearMatch && monthMatch) {
      const monthNames: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      const date = new Date(parseInt(yearMatch[1]), monthNames[monthMatch[1].toLowerCase()]);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    return month; // Return as-is if can't parse
  };

  // Merge year data for proper LineChart rendering - initialize all 12 months with 0
  const mergedYearData = useMemo(() => {
    if (!chartData || !selectedChartYears.length) return [];

    // Initialize all 12 months with 0 for each selected year to prevent broken lines
    const dataMap = new Map<string, Record<string, number | string>>();
    for (let m = 1; m <= 12; m++) {
      const monthNum = m.toString().padStart(2, '0');
      const entry: Record<string, number | string> = { monthNum };
      selectedChartYears.forEach((year) => {
        entry[year] = 0;
      });
      dataMap.set(monthNum, entry);
    }

    // Fill in actual data from the API
    selectedChartYears.forEach((year) => {
      chartData.yearOverYear
        .filter((d) => d.year === year)
        .forEach((d) => {
          dataMap.get(d.monthNum)![year] = d.count;
        });
    });

    return Array.from(dataMap.values()).sort((a, b) =>
      parseInt(a.monthNum as string) - parseInt(b.monthNum as string)
    );
  }, [chartData, selectedChartYears]);

  // Filter monthly data based on selected chart years for bar chart
  const filteredMonthlyData = useMemo(() => {
    if (!chartData?.monthly) return [];
    if (!selectedChartYears.length) return chartData.monthly.slice(-24);
    return chartData.monthly.filter((d) => {
      const year = d.month.split('-')[0];
      return selectedChartYears.includes(year);
    });
  }, [chartData, selectedChartYears]);

  // Get unique years from permit summaries for filtering
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    permitSummaries.forEach((s) => {
      const match = s.month.match(/^(\d{4})/);
      if (match) years.add(match[1]);
    });
    return Array.from(years).sort().reverse();
  }, [permitSummaries]);

  // Filter summaries by year
  const filteredPermitSummaries = useMemo(() => {
    if (filterYear === 'all') return permitSummaries;
    return permitSummaries.filter((s) => s.month.startsWith(filterYear));
  }, [permitSummaries, filterYear]);

  const currentSummaries = activeTab === 'permits' ? filteredPermitSummaries : businessSummaries;
  const getPdfUrl = activeTab === 'permits' ? getPermitPdfUrl : getBusinessPdfUrl;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
            <Building2 className="w-8 h-8 mr-3 text-emerald-500" aria-hidden="true" />
            Development & Construction
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Track building permits, new construction, and business growth
          </p>
        </div>
        <div className="text-right">
          <a
            href="https://www.flowerybranchga.org/departments/community_development/forms.php"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
          >
            City Permits
            <ExternalLink className="w-4 h-4 ml-2" />
          </a>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Search &quot;permit&quot; to filter forms</p>
        </div>
      </div>

      {/* Building Activity Charts Section - Collapsible */}
      {chartData && chartData.monthly.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6 overflow-hidden">
          <button
            onClick={() => setChartsExpanded(!chartsExpanded)}
            className="w-full flex items-center p-6 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            {chartsExpanded ? (
              <ChevronDown className="w-5 h-5 text-slate-400 mr-2" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-400 mr-2" />
            )}
            <TrendingUp className="w-5 h-5 text-emerald-500 mr-2" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Building Activity</h2>
            <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
              {chartData.totals.permits.toLocaleString()} permits across {chartData.totals.months} months
            </span>
          </button>

          {chartsExpanded && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 pt-0">
            {/* Monthly Permit Counts */}
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center">
                <BarChart3 className="w-4 h-4 mr-2 text-slate-500 dark:text-slate-400" />
                Monthly Permits Over Time
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredMonthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => {
                        const [year, month] = value.split('-');
                        return `${MONTH_LABELS[parseInt(month) - 1]} '${year.slice(2)}`;
                      }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 11 }} width={35} />
                    <Tooltip
                      formatter={(value) => [value, 'Permits']}
                      labelFormatter={(label) => {
                        const [year, month] = label.split('-');
                        return `${MONTH_LABELS[parseInt(month) - 1]} ${year}`;
                      }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Permit Type Breakdown */}
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Permits by Type <span className="text-slate-400 font-normal">(all years)</span></h3>
              <div className="h-64 flex items-center">
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData.byType.slice(0, 6)}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      dataKey="count"
                      nameKey="type"
                    >
                      {chartData.byType.slice(0, 6).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [value?.toLocaleString() ?? '', name]}
                      contentStyle={{ fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-1/2 pl-4 space-y-1">
                  {chartData.byType.slice(0, 6).map((item, index) => (
                    <div key={item.type} className="flex items-center text-xs">
                      <div
                        className="w-3 h-3 rounded-sm mr-2 flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="text-slate-600 dark:text-slate-400 truncate capitalize">{item.type}</span>
                      <span className="ml-auto text-slate-500 dark:text-slate-400 font-medium">{item.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Year-over-Year Comparison */}
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 lg:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Year-over-Year Comparison</h3>
                <div className="flex flex-wrap gap-1">
                  {chartData.years.map((year) => (
                    <button
                      key={year}
                      onClick={() => {
                        setSelectedChartYears((prev) =>
                          prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
                        );
                      }}
                      className={`px-2 py-1 text-xs rounded transition ${
                        selectedChartYears.includes(year)
                          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mergedYearData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="monthNum"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => MONTH_LABELS[parseInt(value) - 1]}
                    />
                    <YAxis tick={{ fontSize: 11 }} width={35} />
                    <Tooltip
                      formatter={(value, name) => [value, name]}
                      labelFormatter={(label) => MONTH_LABELS[parseInt(label) - 1]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {selectedChartYears.map((year, index) => (
                      <Line
                        key={year}
                        type="monotone"
                        dataKey={year}
                        name={year}
                        stroke={CHART_COLORS[index % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6">
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => handleTabChange('permits')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              activeTab === 'permits'
                ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            Building Permits ({permitSummaries.length} months)
          </button>
          <button
            onClick={() => handleTabChange('businesses')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              activeTab === 'businesses'
                ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            New Businesses ({businessSummaries.length} months)
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Year filter - only show for permits tab */}
          {activeTab === 'permits' && availableYears.length > 1 && (
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100 dark:border-slate-700">
              <span className="text-sm text-slate-600 dark:text-slate-400">Filter by year:</span>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setFilterYear('all')}
                  className={`px-3 py-1 text-sm rounded transition ${
                    filterYear === 'all'
                      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  All ({permitSummaries.length})
                </button>
                {availableYears.map((year) => {
                  const count = permitSummaries.filter((s) => s.month.startsWith(year)).length;
                  return (
                    <button
                      key={year}
                      onClick={() => setFilterYear(year)}
                      className={`px-3 py-1 text-sm rounded transition ${
                        filterYear === year
                          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {year} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {loading ? (
            <div className="text-center py-12" role="status" aria-live="polite">
              <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto" aria-hidden="true"></div>
              <p className="text-slate-500 dark:text-slate-400 mt-4">Loading development data...</p>
            </div>
          ) : currentSummaries.length > 0 ? (
            <div className="space-y-3">
              {currentSummaries.map((item) => (
                <div key={item.month} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleMonth(item.month)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                  >
                    <div className="flex items-center">
                      {expandedMonths.has(item.month) ? (
                        <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 mr-2" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400 mr-2" />
                      )}
                      <span className="font-medium text-slate-900 dark:text-slate-100">{formatMonth(item.month)}</span>
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                        <Sparkles className="w-3 h-3 mr-1" />
                        AI Summary
                      </span>
                    </div>
                    <a
                      href={item.pdfUrl || getPdfUrl(item.month)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center px-3 py-1 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition"
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      View Report
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </button>
                  {expandedMonths.has(item.month) && (
                    <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                      <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                        <SummaryContent summary={item.summary} />
                      </div>
                      <p className="text-xs text-slate-400 mt-4 italic">
                        AI-generated summary. See official report for complete information.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState type={activeTab} />
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">About This Data</h3>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Monthly permit and business reports are sourced from official City of Flowery Branch PDF documents.
          AI summaries help highlight key information, but always refer to the official reports for complete details.
          For permit applications or questions, contact the Community Development department.
        </p>
      </div>
    </div>
  );
}

function SummaryContent({ summary }: { summary: string }) {
  // Parse markdown-style formatting
  const lines = summary.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // Headers with ### (h3)
        if (trimmed.startsWith('### ')) {
          const text = trimmed.slice(4);
          return (
            <h4 key={i} className="font-semibold text-slate-900 dark:text-slate-100 mt-4 first:mt-0">
              {text}
            </h4>
          );
        }

        // Headers (bold text with **)
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          const text = trimmed.slice(2, -2);
          return (
            <h4 key={i} className="font-semibold text-slate-900 dark:text-slate-100 mt-3 first:mt-0">
              {text}
            </h4>
          );
        }

        // Bullet points
        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const text = trimmed.replace(/^[•\-*]\s*/, '');
          // Handle inline bold
          const parts = text.split(/\*\*([^*]+)\*\*/g);
          return (
            <p key={i} className="text-sm text-slate-700 dark:text-slate-300 pl-4">
              • {parts.map((part, j) =>
                j % 2 === 1 ? (
                  <strong key={j} className="font-semibold">{part}</strong>
                ) : (
                  part
                )
              )}
            </p>
          );
        }

        // Regular text with potential inline bold
        const parts = trimmed.split(/\*\*([^*]+)\*\*/g);
        return (
          <p key={i} className="text-sm text-slate-700 dark:text-slate-300">
            {parts.map((part, j) =>
              j % 2 === 1 ? (
                <strong key={j} className="font-semibold">{part}</strong>
              ) : (
                part
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

function EmptyState({ type }: { type: 'permits' | 'businesses' }) {
  return (
    <div className="text-center py-12">
      <Building2 className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
        No {type === 'permits' ? 'permit' : 'business'} summaries yet
      </h3>
      <p className="text-slate-500 dark:text-slate-400 mb-4">
        AI summaries for monthly {type === 'permits' ? 'permit' : 'business'} reports haven&apos;t been generated yet.
      </p>
      <p className="text-sm text-slate-400">
        Use the <a href="/admin" className="text-emerald-600 dark:text-emerald-400 hover:underline">admin panel</a> to generate summaries.
      </p>
    </div>
  );
}
