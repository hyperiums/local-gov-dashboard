'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Filter, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { getRecentYears } from '@/lib/dates';
import { civicClerkUrl, cityAddress, meetingSchedule } from '@/lib/city-config-client';
import MeetingWithOrdinances from './MeetingWithOrdinances';
import type { Meeting } from './types';

export default function MeetingsContent() {
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
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
            <Calendar className="w-8 h-8 mr-3 text-emerald-500" aria-hidden="true" />
            City Council Meetings
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Browse past and upcoming city council meetings
          </p>
        </div>
        <a
          href={civicClerkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
        >
          Official Portal
          <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <div className="flex space-x-2" role="group" aria-label="Filter meetings">
              {(['all', 'upcoming', 'past'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    filter === f
                      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
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
              <span className="text-sm text-slate-500 dark:text-slate-400">Jump to:</span>
              <select
                onChange={(e) => handleJumpToMonth(e.target.value)}
                aria-label="Jump to month"
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
        <div className="text-center py-12" role="status" aria-live="polite">
          <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto" aria-hidden="true"></div>
          <p className="text-slate-500 dark:text-slate-400 mt-4">Loading meetings...</p>
        </div>
      ) : years.length > 0 ? (
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
                    <ChevronDown className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-2" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-2" />
                  )}
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{year}</h2>
                  <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">
                    {meetingsByYear[year].length} meeting{meetingsByYear[year].length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
              {expandedYears.has(year) && (
                <div className="border-t border-slate-200 dark:border-slate-700 p-4">
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
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Calendar className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No meetings found</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            {filter === 'upcoming'
              ? 'No upcoming meetings in the database.'
              : filter === 'past'
              ? 'No past meetings in the database.'
              : 'No meetings have been added yet.'}
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Visit the{' '}
            <a
              href={civicClerkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              CivicClerk Portal
            </a>{' '}
            for the official meeting schedule, or use the{' '}
            <Link href="/admin" className="text-emerald-600 dark:text-emerald-400 hover:underline">
              admin panel
            </Link>{' '}
            to import data.
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/30 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">About This Data</h3>
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Meeting information is sourced from the official CivicClerk portal.
          City Council meetings typically occur {meetingSchedule}
          at City Hall ({cityAddress}). AI-generated summaries are provided for convenience
          but should not replace reading the official documents.
        </p>
      </div>
    </div>
  );
}
