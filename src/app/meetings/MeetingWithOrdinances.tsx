'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Scale, FileText, ExternalLink } from 'lucide-react';
import MeetingCard from '@/components/MeetingCard';
import { normalizeAction, ACTION_LABELS } from '@/components/ordinances/types';
import type { Meeting, OrdinanceWithAction, ResolutionWithMeeting } from './types';

interface MeetingWithOrdinancesProps {
  meeting: Meeting;
  highlighted?: boolean;
  expandOrdinances?: boolean;
}

export default function MeetingWithOrdinances({ meeting, highlighted, expandOrdinances }: MeetingWithOrdinancesProps) {
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
    const normalized = normalizeAction(action);

    const colorMap: Record<string, string> = {
      'introduced': 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
      'first_reading': 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300',
      'second_reading': 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
      'adopted': 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
      'tabled': 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
      'amended': 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
      'discussed': 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
      'denied': 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
      'rejected': 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    };

    return {
      label: ACTION_LABELS[normalized] || normalized,
      color: colorMap[normalized] || colorMap['discussed'],
    };
  };

  // Map resolution status to display style
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'adopted':
        return 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300';
      case 'rejected':
        return 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300';
      case 'tabled':
        return 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300';
      default:
        return 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
    }
  };

  return (
    <div
      id={`meeting-${meeting.id}`}
      className={`flex flex-col ${highlighted ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900 rounded-xl' : ''}`}
    >
      <MeetingCard meeting={meeting} showSummary />

      {/* Toggle Buttons Row */}
      <div className="mt-2 flex gap-2">
        {/* Ordinances Toggle Button */}
        <button
          onClick={toggleOrdinances}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 transition border border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <Scale className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          {showOrdinances ? 'Hide Ordinances' : 'Ordinances'}
        </button>

        {/* Resolutions Toggle Button */}
        <button
          onClick={toggleResolutions}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 transition border border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          {showResolutions ? 'Hide Resolutions' : 'Resolutions'}
        </button>
      </div>

      {/* Ordinances Section */}
      {showOrdinances && (
        <div className="mt-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <div className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            <Scale className="w-4 h-4 mr-2 text-emerald-500 dark:text-emerald-400" />
            Ordinances Discussed
          </div>

          {loadingOrdinances ? (
            <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
              <div className="animate-spin w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full mr-2"></div>
              Loading...
            </div>
          ) : ordinances.length > 0 ? (
            <div className="space-y-2">
              {ordinances.map((ord) => (
                <div key={ord.id} className="flex items-start justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <Link
                    href={`/ordinances?expand=${ord.number}`}
                    className="flex-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition -m-2 p-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
                        #{ord.number}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${getActionDisplay(ord.action).color}`}>
                        {getActionDisplay(ord.action).label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{ord.title}</p>
                  </Link>
                  {ord.municode_url && (
                    <a
                      href={ord.municode_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 p-1.5 text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition shrink-0"
                      title="View official text on Municode"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No ordinances were discussed at this meeting.</p>
          )}
        </div>
      )}

      {/* Resolutions Section */}
      {showResolutions && (
        <div className="mt-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <div className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            <FileText className="w-4 h-4 mr-2 text-blue-500 dark:text-blue-400" />
            Resolutions
          </div>

          {loadingResolutions ? (
            <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>
              Loading...
            </div>
          ) : resolutions.length > 0 ? (
            <div className="space-y-2">
              {resolutions.map((res) => (
                <Link
                  key={res.id}
                  href={`/resolutions?expand=${res.number}`}
                  className="block p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300">
                      #{res.number}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs capitalize ${getStatusStyle(res.status)}`}>
                      {res.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{res.title}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No resolutions were passed at this meeting.</p>
          )}
        </div>
      )}
    </div>
  );
}
