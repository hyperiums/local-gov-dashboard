'use client';

import { useState, useRef } from 'react';
import { Database, Download, RefreshCw, CheckCircle, XCircle, AlertCircle, Sparkles, Upload, LogOut, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getRecentYears, getRecentFiscalYears, getHistoricalYears, getCurrentYear } from '@/lib/dates';

interface ScrapeResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export default function AdminPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [strategicFile, setStrategicFile] = useState<File | null>(null);
  const [strategicYear, setStrategicYear] = useState(new Date().getFullYear().toString());
  const [globalForceRefresh, setGlobalForceRefresh] = useState(false);
  const [globalBatchLimit, setGlobalBatchLimit] = useState(10);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  const runScrape = async (type: string, params?: Record<string, unknown>) => {
    setLoading(type);
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, params }),
      });
      const data = await response.json();
      setResults(prev => [{
        success: data.success || response.ok,
        message: data.success ? `${type} completed successfully` : undefined,
        error: data.error,
        data,
      }, ...prev.slice(0, 9)]);
    } catch (error) {
      setResults(prev => [{
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, ...prev.slice(0, 9)]);
    } finally {
      setLoading(null);
    }
  };

  const uploadStrategicPlan = async () => {
    if (!strategicFile) return;

    setLoading('upload-strategic');
    try {
      const formData = new FormData();
      formData.append('file', strategicFile);
      formData.append('year', strategicYear);

      const response = await fetch('/api/upload-strategic-plan', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      setResults(prev => [{
        success: data.success || response.ok,
        message: data.success ? `Strategic Plan FY${strategicYear} uploaded and processed` : undefined,
        error: data.error,
        data,
      }, ...prev.slice(0, 9)]);

      // Clear the file input on success
      if (data.success) {
        setStrategicFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (error) {
      setResults(prev => [{
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      }, ...prev.slice(0, 9)]);
    } finally {
      setLoading(null);
    }
  };

  const currentYear = getCurrentYear().toString();
  const recentYears = getRecentYears(3); // e.g., ['2026', '2025', '2024']
  const backfillYears = getRecentYears(3); // e.g., ['2026', '2025', '2024'] - includes 3 years to not miss any
  const historicalYears = getHistoricalYears(2009, 3); // Years before recent 3
  const fiscalYears = getRecentFiscalYears(4); // For strategic plan dropdown

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <Database className="w-8 h-8 text-emerald-500 mr-3" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Data Admin</h1>
            <p className="text-slate-600">Import and manage civic data</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </button>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-amber-500 mr-3 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900">Admin Access</h3>
            <p className="text-sm text-amber-800">
              This page is for data administration. Scraping operations may take time
              and make requests to official city sources. Use responsibly.
            </p>
          </div>
        </div>
      </div>

      {/* Global Scrape Options */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-8">
        <div className="flex items-center mb-3">
          <Settings className="w-5 h-5 text-slate-500 mr-2" />
          <h3 className="font-semibold text-slate-900">Scrape Options</h3>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={globalForceRefresh}
              onChange={(e) => setGlobalForceRefresh(e.target.checked)}
              className="w-4 h-4 text-purple-600 border-slate-300 rounded focus:ring-purple-500"
            />
            <span className="ml-2 text-sm text-slate-700">Force Refresh</span>
            <span className="ml-1 text-xs text-slate-500">(regenerate existing)</span>
          </label>
          <div className="flex items-center">
            <label className="text-sm text-slate-700 mr-2">Batch Limit:</label>
            <input
              type="number"
              min={1}
              max={100}
              value={globalBatchLimit}
              onChange={(e) => setGlobalBatchLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
              className="w-16 px-2 py-1 border border-slate-300 rounded text-sm text-center"
            />
            <span className="ml-1 text-xs text-slate-500">(items per op)</span>
          </div>
        </div>
      </div>

      {/* Database Management */}
      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6 mb-8">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center">
          <Database className="w-5 h-5 text-red-500 mr-2" />
          Database Management
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Reset the database to start fresh. This will delete all scraped data but preserve the schema.
          Use before a full data refresh.
        </p>
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to delete ALL data? This cannot be undone.')) {
              runScrape('reset-database');
            }
          }}
          disabled={loading !== null}
          className="w-full flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
        >
          {loading === 'reset-database' ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Database className="w-4 h-4 mr-2" />
          )}
          Reset All Data (Keep Schema)
        </button>
      </div>

      {/* Scrape Actions */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Meetings */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Meeting Data</h2>
          <p className="text-sm text-slate-600 mb-4">
            Import meeting data from the CivicClerk portal. The system automatically discovers valid event IDs.
          </p>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-600">From year:</span>
              <select
                id="meetingMinYear"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                defaultValue={backfillYears[backfillYears.length - 1]}
              >
                {[...backfillYears, ...historicalYears.slice(0, 5)].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                const minYear = parseInt((document.getElementById('meetingMinYear') as HTMLSelectElement).value);
                runScrape('bulk-meetings-with-agenda', { minYear, limit: globalBatchLimit, forceRefresh: globalForceRefresh });
              }}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading === 'bulk-meetings-with-agenda' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Import Meetings + Agenda Items
            </button>
            <button
              onClick={() => runScrape('bulk-meetings', { startId: 1, endId: 200, discover: true })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition text-sm"
            >
              {loading === 'bulk-meetings' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Import Meetings Only (No Agenda)
            </button>
            <button
              onClick={() => runScrape('discover-meetings', { startId: 1, endId: 200 })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition text-sm"
            >
              Preview Valid Event IDs
            </button>
            <input
              type="number"
              placeholder="Single Event ID"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              id="eventId"
            />
            <button
              onClick={() => {
                const input = document.getElementById('eventId') as HTMLInputElement;
                const eventId = parseInt(input.value);
                if (eventId) runScrape('meeting', { eventId });
              }}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition"
            >
              Import Single Meeting
            </button>
          </div>
        </div>

        {/* Permits */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Permit Data</h2>
          <p className="text-sm text-slate-600 mb-4">
            Import monthly permit statistics from the city website PDFs.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('bulk-permits', { years: backfillYears })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading === 'bulk-permits' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Backfill Permits ({backfillYears[backfillYears.length - 1]}-{backfillYears[0]})
            </button>
            <button
              onClick={() => runScrape('bulk-permits', { year: currentYear })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition text-sm"
            >
              Import {currentYear} Only
            </button>
            <div className="flex space-x-2">
              <select className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" id="permitYear">
                {recentYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <select className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" id="permitMonth">
                {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                const year = (document.getElementById('permitYear') as HTMLSelectElement).value;
                const month = (document.getElementById('permitMonth') as HTMLSelectElement).value;
                runScrape('permits', { year, month });
              }}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition"
            >
              Import Single Month
            </button>
          </div>
        </div>

        {/* Businesses */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Business Data</h2>
          <p className="text-sm text-slate-600 mb-4">
            Import monthly new business registrations from the city website PDFs.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('bulk-businesses', { years: backfillYears })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading === 'bulk-businesses' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Backfill Businesses ({backfillYears[backfillYears.length - 1]}-{backfillYears[0]})
            </button>
            <button
              onClick={() => runScrape('bulk-businesses', { years: [currentYear] })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition text-sm"
            >
              Import {currentYear} Only
            </button>
          </div>
        </div>

        {/* Development Summaries */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center">
            <Sparkles className="w-5 h-5 text-purple-500 mr-2" />
            Development Summaries
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Generate AI summaries of monthly permit and business reports. These summaries are shown on the Development page.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('generate-permit-summaries', { years: backfillYears, forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-permit-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Permit Summaries ({backfillYears[backfillYears.length - 1]}-{backfillYears[0]})
            </button>
            <button
              onClick={() => runScrape('generate-permit-summaries', { years: historicalYears.slice(0, 4), forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition"
            >
              {loading === 'generate-permit-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Permit Summaries (Historical)
            </button>
            <button
              onClick={() => runScrape('generate-business-summaries', { years: backfillYears, forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition text-sm"
            >
              {loading === 'generate-business-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Business Summaries ({backfillYears[backfillYears.length - 1]}-{backfillYears[0]})
            </button>
          </div>
        </div>

        {/* Budget Summaries */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center">
            <Sparkles className="w-5 h-5 text-emerald-500 mr-2" />
            Budget Summaries
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Generate AI summaries for annual city budget documents. Shows what the city plans to spend.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('generate-budget-summaries', { forceRefresh: globalForceRefresh, limit: globalBatchLimit })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-budget-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Budget Summaries
            </button>
            <button
              onClick={() => runScrape('generate-budget-summaries', { forceRefresh: true })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition text-sm"
            >
              Regenerate All (Force Refresh)
            </button>
          </div>
        </div>

        {/* Audit/Financial Report Summaries */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center">
            <Sparkles className="w-5 h-5 text-blue-500 mr-2" />
            Financial Audit Summaries
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Generate AI summaries for Annual Comprehensive Financial Reports (ACFRs). Shows audited results of what actually happened.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('generate-audit-summaries', { forceRefresh: globalForceRefresh, limit: globalBatchLimit })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-audit-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Audit Summaries
            </button>
            <button
              onClick={() => runScrape('generate-audit-summaries', { forceRefresh: true })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition text-sm"
            >
              Regenerate All (Force Refresh)
            </button>
          </div>
        </div>

        {/* Civic Documents Summaries */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center">
            <Sparkles className="w-5 h-5 text-teal-500 mr-2" />
            Civic Documents
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Generate AI summaries for civic documents: SPLOST reports, public notices, strategic plans, and water quality reports.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('generate-civic-summaries', { docType: 'splost', forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-civic-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate SPLOST Summaries
            </button>
            <button
              onClick={() => runScrape('generate-civic-summaries', { docType: 'notice', forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-civic-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Public Notice Summaries
            </button>
            <button
              onClick={() => runScrape('generate-civic-summaries', { docType: 'strategic', forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-civic-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Strategic Plan Summaries
            </button>
            <button
              onClick={() => runScrape('generate-civic-summaries', { docType: 'water-quality', forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-civic-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Water Quality Summaries
            </button>
          </div>
        </div>

        {/* Strategic Plan Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center">
            <Upload className="w-5 h-5 text-indigo-500 mr-2" />
            Upload Strategic Plan
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Strategic plans are hosted on ClearGov and must be manually exported as PDF.
            Visit the <a href="https://www.flowerybranchga.org/departments/finance/fy2025_strategic_plan.php" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">strategic plan page</a>, click &quot;PDF&quot; tab, enter your email, and upload the generated PDF here.
          </p>
          <div className="space-y-3">
            <input
              type="file"
              accept=".pdf,application/pdf"
              ref={fileInputRef}
              onChange={(e) => setStrategicFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            <div className="flex space-x-2">
              <span className="text-sm text-slate-600 py-2">Fiscal Year:</span>
              <select
                value={strategicYear}
                onChange={(e) => setStrategicYear(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {fiscalYears.map(y => (
                  <option key={y} value={y}>FY{y}</option>
                ))}
              </select>
            </div>
            <button
              onClick={uploadStrategicPlan}
              disabled={loading !== null || !strategicFile}
              className="w-full flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {loading === 'upload-strategic' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload & Generate Summary
            </button>
          </div>
        </div>

        {/* Financial Reports */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Financial Reports</h2>
          <p className="text-sm text-slate-600 mb-4">
            Discover available financial reports and audits.
          </p>
          <button
            onClick={() => runScrape('financial')}
            disabled={loading !== null}
            className="w-full flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {loading === 'financial' ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Scan Financial Reports
          </button>
        </div>

        {/* Ordinances */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Ordinances</h2>
          <p className="text-sm text-slate-600 mb-4">
            Import ordinance data from Municode. Links to official source documents.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('ordinances', { years: recentYears })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading === 'ordinances' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Import Recent Ordinances ({recentYears[recentYears.length - 1]}-{recentYears[0]})
            </button>
            <button
              onClick={() => runScrape('ordinances', { years: historicalYears })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition"
            >
              Import Historical Ordinances (2009-{historicalYears[0]})
            </button>
            <button
              onClick={() => runScrape('link-ordinances')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading === 'link-ordinances' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Link Ordinances to Meetings
            </button>
          </div>
        </div>

        {/* AI Summaries - Ordinances */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center">
            <Sparkles className="w-5 h-5 text-purple-500 mr-2" />
            Ordinance Summaries
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Generate AI-powered summaries for ordinances by analyzing their official PDFs.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('generate-ordinance-summaries', { limit: globalBatchLimit, forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-ordinance-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Ordinance Summaries
            </button>
          </div>
        </div>

        {/* Resolutions */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Resolutions</h2>
          <p className="text-sm text-slate-600 mb-4">
            Extract resolutions from meeting agendas and generate AI summaries.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('extract-resolutions')}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading === 'extract-resolutions' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Extract All Resolutions
            </button>
            <button
              onClick={() => runScrape('generate-resolution-summaries', { limit: globalBatchLimit, forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-resolution-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Resolution Summaries
            </button>
            <button
              onClick={() => runScrape('generate-resolution-summaries', { limit: 100, forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition text-sm"
            >
              Generate All Resolution Summaries
            </button>
          </div>
        </div>

        {/* AI Summaries - Meeting Agendas */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center">
            <Sparkles className="w-5 h-5 text-purple-500 mr-2" />
            Meeting Agenda Summaries
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Generate AI summaries for meeting agendas so citizens know what will be discussed.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('generate-meeting-summaries', { limit: globalBatchLimit, status: 'upcoming', summaryType: 'agenda', forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-meeting-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Summarize Upcoming Meetings
            </button>
            <button
              onClick={() => runScrape('generate-meeting-summaries', { limit: globalBatchLimit, status: 'all', summaryType: 'agenda', forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition"
            >
              Summarize All Agendas
            </button>
          </div>
        </div>

        {/* AI Summaries - Meeting Minutes */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center">
            <Sparkles className="w-5 h-5 text-blue-500 mr-2" />
            Meeting Minutes Summaries
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Generate AI summaries for meeting minutes so citizens know what decisions were made.
            Only available for past meetings with approved minutes.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => runScrape('generate-meeting-summaries', { limit: globalBatchLimit, status: 'past', summaryType: 'minutes', forceRefresh: globalForceRefresh })}
              disabled={loading !== null}
              className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading === 'generate-meeting-summaries' ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Summarize Past Minutes
            </button>
          </div>
        </div>
      </div>

      {/* Results Log */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Operation Log</h2>
        {results.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            No operations run yet. Use the buttons above to import data.
          </p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {results.map((result, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg text-sm ${
                  result.success
                    ? 'bg-emerald-50 border border-emerald-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                <div className="flex items-start">
                  {result.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 mr-2 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 mr-2 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={result.success ? 'text-emerald-800' : 'text-red-800'}>
                      {result.message || result.error}
                    </p>
                    {result.data && (
                      <pre className="mt-2 text-xs bg-slate-100 p-2 rounded overflow-x-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
