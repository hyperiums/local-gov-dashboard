'use client';

import { useState } from 'react';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface WeeklySummaryProps {
  initialSummary?: string;
}

export default function WeeklySummary({ initialSummary }: WeeklySummaryProps) {
  const [summary, setSummary] = useState(initialSummary || '');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState('');

  const generateSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'weekly', params: { forceRefresh: true } }),
      });

      const data = await response.json();
      if (data.success) {
        setSummary(data.summary);
      } else {
        setError(data.error || 'Failed to generate summary');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg text-white overflow-hidden">
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center space-x-3">
          <Sparkles className="w-5 h-5" />
          <h2 className="text-lg font-semibold">This Week in Flowery Branch</h2>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              generateSummary();
            }}
            disabled={loading}
            className="p-2 hover:bg-white/10 rounded-lg transition disabled:opacity-50"
            title="Refresh summary"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-6 pb-6">
          {error && (
            <div className="bg-red-500/20 border border-red-300/30 rounded-lg p-3 mb-4">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {summary ? (
            <div className="bg-white/10 rounded-lg p-4">
              <div className="prose prose-sm prose-invert max-w-none">
                {summary.split('\n').map((paragraph, i) => (
                  <p key={i} className="text-white/90 leading-relaxed mb-3 last:mb-0">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white/10 rounded-lg p-6 text-center">
              <p className="text-white/80 mb-4">
                Get an AI-generated summary of what happened in Flowery Branch this week.
              </p>
              <button
                onClick={generateSummary}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-white text-emerald-600 font-medium rounded-lg hover:bg-white/90 transition disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Summary
                  </>
                )}
              </button>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-white/60 mt-4 text-center">
            Generated from official public records. AI summaries are for convenience only.
          </p>
        </div>
      )}
    </div>
  );
}
