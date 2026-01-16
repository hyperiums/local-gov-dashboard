'use client';

import { useState } from 'react';
import { Calendar, MapPin, FileText, ExternalLink, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface MeetingCardProps {
  meeting: {
    id: string;
    date: string;
    title: string;
    location?: string | null;
    status: string;
    agenda_url?: string | null;
    minutes_url?: string | null;
    packet_url?: string | null;
    summary?: string | null;
    agenda_summary?: string | null;
    minutes_summary?: string | null;
  };
  showSummary?: boolean;
}

// Simple markdown renderer for summaries
function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    // Handle bold text with ** markers
    const formattedLine = line.replace(
      /\*\*([^*]+)\*\*/g,
      '<strong class="font-semibold text-slate-900 dark:text-slate-100">$1</strong>'
    );

    // Handle bullet points
    if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
      const bulletContent = line.trim().replace(/^[•-]\s*/, '');
      const formattedBullet = bulletContent.replace(
        /\*\*([^*]+)\*\*/g,
        '<strong class="font-semibold text-slate-900 dark:text-slate-100">$1</strong>'
      );
      return (
        <li
          key={i}
          className="ml-4 text-sm text-slate-700 dark:text-slate-300"
          dangerouslySetInnerHTML={{ __html: formattedBullet }}
        />
      );
    }

    // Regular line (might be a header or paragraph)
    if (formattedLine.includes('<strong')) {
      return (
        <p
          key={i}
          className="text-sm text-slate-700 dark:text-slate-300 mt-2 first:mt-0"
          dangerouslySetInnerHTML={{ __html: formattedLine }}
        />
      );
    }

    // Skip empty lines
    if (!line.trim()) return null;

    return (
      <p key={i} className="text-sm text-slate-700 dark:text-slate-300">
        {line}
      </p>
    );
  });
}

export default function MeetingCard({ meeting, showSummary = false }: MeetingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const date = parseISO(meeting.date);
  const isUpcoming = meeting.status === 'upcoming';

  // Use new columns if available, fall back to legacy summary
  const agendaSummary = meeting.agenda_summary || meeting.summary;
  const minutesSummary = meeting.minutes_summary;
  const hasSummary = agendaSummary || minutesSummary;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow">
      {/* Date banner */}
      <div className={`px-4 py-2 ${isUpcoming ? 'bg-emerald-500' : 'bg-slate-500 dark:bg-slate-600'} text-white`}>
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4" />
          <span className="font-medium">{format(date, 'EEEE, MMMM d, yyyy')}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-center flex-wrap gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">{meeting.title}</h3>
          {hasSummary && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              <Sparkles className="w-3 h-3 mr-1" />
              AI Summary
            </span>
          )}
        </div>

        {meeting.location && (
          <div className="flex items-center text-slate-500 dark:text-slate-400 text-sm mt-2">
            <MapPin className="w-4 h-4 mr-1 shrink-0" />
            <span>{meeting.location}</span>
          </div>
        )}

        {/* Summary Toggle Button */}
        {showSummary && hasSummary && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-300 transition border border-slate-200 dark:border-slate-600"
          >
            <Sparkles className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            {expanded ? 'Hide AI Summary' : 'Show AI Summary'}
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}

        {/* Summaries (collapsed by default) */}
        {showSummary && hasSummary && expanded && (
          <div className="mt-3 space-y-3">
            {/* Agenda Summary */}
            {agendaSummary && (
              <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-100 dark:border-purple-800">
                <div className="flex items-center text-xs text-purple-700 dark:text-purple-300 mb-2 font-medium">
                  <Sparkles className="w-3 h-3 mr-1" />
                  {isUpcoming ? "What's on the Agenda" : 'Agenda Overview'}
                </div>
                <div className="space-y-1">
                  {renderMarkdown(agendaSummary)}
                </div>
              </div>
            )}

            {/* Minutes Summary (only for past meetings) */}
            {minutesSummary && !isUpcoming && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
                <div className="flex items-center text-xs text-blue-700 dark:text-blue-300 mb-2 font-medium">
                  <Sparkles className="w-3 h-3 mr-1" />
                  What Happened
                </div>
                <div className="space-y-1">
                  {renderMarkdown(minutesSummary)}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
              AI-generated summary. See official documents for complete information.
            </p>
          </div>
        )}

        {/* Document links */}
        <div className="flex flex-wrap gap-2 mt-4">
          {meeting.agenda_url && (
            <a
              href={meeting.agenda_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 transition"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Agenda
              <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
            </a>
          )}
          {meeting.packet_url && (
            <a
              href={meeting.packet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 transition"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Packet
              <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
            </a>
          )}
          {/* Only show minutes link for past meetings */}
          {meeting.minutes_url && !isUpcoming && (
            <a
              href={meeting.minutes_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 transition"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Minutes
              <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
            </a>
          )}
        </div>

        {/* Status badge */}
        <div className="mt-4 flex justify-end">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isUpcoming
                ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300'
            }`}
          >
            {isUpcoming ? 'Upcoming' : 'Past Meeting'}
          </span>
        </div>
      </div>
    </div>
  );
}
