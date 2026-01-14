'use client';

import { useState, useEffect } from 'react';
import { FileText, ExternalLink, Sparkles, ChevronDown, ChevronRight, DollarSign, Bell, Target, Droplets, List, AlignLeft, FileSearch } from 'lucide-react';

type DocType = 'splost' | 'notice' | 'strategic' | 'water-quality';
type SummaryLevel = 'headline' | 'brief' | 'detailed';

interface SummaryLevels {
  headline: string | null;
  brief: string | null;
  detailed: string;
}

interface CivicDocument {
  type: DocType;
  id: string;
  title: string;
  summary: string;
  summaryLevels: SummaryLevels;
  pdfUrl: string | null;
  date: string | null;
}

interface DocumentCounts {
  splost: number;
  notice: number;
  strategic: number;
  'water-quality': number;
  total: number;
}

const DOC_TYPE_CONFIG: Record<DocType, { label: string; description: string; icon: typeof FileText }> = {
  splost: {
    label: 'SPLOST Reports',
    description: 'Special Purpose Local Option Sales Tax spending reports',
    icon: DollarSign,
  },
  notice: {
    label: 'Public Notices',
    description: 'Official city announcements and public notices',
    icon: Bell,
  },
  strategic: {
    label: 'Strategic Plans',
    description: 'City planning and strategic initiatives',
    icon: Target,
  },
  'water-quality': {
    label: 'Water Quality',
    description: 'Annual water quality reports (CCR)',
    icon: Droplets,
  },
};

const SUMMARY_LEVEL_CONFIG: Record<SummaryLevel, { label: string; description: string; icon: typeof List }> = {
  headline: {
    label: 'Headline',
    description: '1 sentence',
    icon: List,
  },
  brief: {
    label: 'Brief',
    description: '~150 words',
    icon: AlignLeft,
  },
  detailed: {
    label: 'Detailed',
    description: 'Full analysis',
    icon: FileSearch,
  },
};

export default function DocumentsPage() {
  const [grouped, setGrouped] = useState<Record<DocType, CivicDocument[]>>({
    splost: [],
    notice: [],
    strategic: [],
    'water-quality': [],
  });
  const [counts, setCounts] = useState<DocumentCounts>({
    splost: 0,
    notice: 0,
    strategic: 0,
    'water-quality': 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<DocType>('splost');
  // Track summary level per document (default to 'brief')
  const [summaryLevels, setSummaryLevels] = useState<Record<string, SummaryLevel>>({});

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/data?type=civic-documents');
        const data = await res.json();
        setGrouped(data.grouped || { splost: [], notice: [], strategic: [], 'water-quality': [] });
        setCounts(data.counts || { splost: 0, notice: 0, strategic: 0, 'water-quality': 0, total: 0 });

        // Auto-expand the first document of each type
        const toExpand: string[] = [];
        for (const type of ['splost', 'notice', 'strategic', 'water-quality'] as DocType[]) {
          const docs = data.grouped?.[type] || [];
          if (docs.length > 0) {
            toExpand.push(`${type}-${docs[0].id}`);
          }
        }
        setExpandedDocs(new Set(toExpand));

        // Set active tab to first type with documents
        for (const type of ['splost', 'notice', 'strategic', 'water-quality'] as DocType[]) {
          if ((data.counts?.[type] || 0) > 0) {
            setActiveTab(type);
            break;
          }
        }
      } catch (error) {
        console.error('Failed to load documents:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const toggleDoc = (key: string) => {
    const newExpanded = new Set(expandedDocs);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedDocs(newExpanded);
  };

  // Get the summary level for a document (default to 'brief')
  const getSummaryLevel = (docKey: string): SummaryLevel => {
    return summaryLevels[docKey] || 'brief';
  };

  // Set the summary level for a document
  const setSummaryLevel = (docKey: string, level: SummaryLevel) => {
    setSummaryLevels(prev => ({ ...prev, [docKey]: level }));
  };

  // Get the appropriate summary text for the current level
  const getSummaryText = (doc: CivicDocument, level: SummaryLevel): string => {
    const levels = doc.summaryLevels;
    if (level === 'headline' && levels.headline) {
      return levels.headline;
    }
    if (level === 'brief' && levels.brief) {
      return levels.brief;
    }
    // Fall back to detailed (always available)
    return levels.detailed;
  };

  const currentDocs = grouped[activeTab] || [];
  const config = DOC_TYPE_CONFIG[activeTab];
  const Icon = config.icon;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center">
            <FileText className="w-8 h-8 mr-3 text-emerald-500" />
            City Documents
          </h1>
          <p className="text-slate-600 mt-1">
            Official city reports, notices, and public documents
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(['splost', 'notice', 'strategic', 'water-quality'] as DocType[]).map((type) => {
          const typeConfig = DOC_TYPE_CONFIG[type];
          const TypeIcon = typeConfig.icon;
          const count = counts[type];
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center ${
                activeTab === type
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <TypeIcon className="w-4 h-4 mr-2" />
              {typeConfig.label}
              {count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === type ? 'bg-emerald-500' : 'bg-slate-300'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center">
            <Icon className="w-5 h-5 text-emerald-500 mr-2" />
            <h2 className="font-semibold text-slate-900">{config.label}</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">{config.description}</p>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-slate-500 mt-4">Loading documents...</p>
            </div>
          ) : currentDocs.length > 0 ? (
            <div className="space-y-3">
              {currentDocs.map((doc) => {
                const docKey = `${doc.type}-${doc.id}`;
                const isExpanded = expandedDocs.has(docKey);
                const currentLevel = getSummaryLevel(docKey);
                const hasHeadline = !!doc.summaryLevels?.headline;
                const hasBrief = !!doc.summaryLevels?.brief;

                return (
                  <div key={docKey} className="border border-slate-200 rounded-lg overflow-hidden">
                    {/* Collapsed header with headline preview */}
                    <button
                      onClick={() => toggleDoc(docKey)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition"
                    >
                      <div className="flex items-center text-left flex-1 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-500 mr-2 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500 mr-2 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-medium text-slate-900">{doc.title}</span>
                            {doc.date && (
                              <span className="text-sm text-slate-500">({doc.date})</span>
                            )}
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                              <Sparkles className="w-3 h-3 mr-1" />
                              AI Summary
                            </span>
                          </div>
                          {/* Show headline in collapsed state */}
                          {!isExpanded && hasHeadline && (
                            <p className="text-sm text-slate-600 mt-1 truncate">
                              {doc.summaryLevels.headline}
                            </p>
                          )}
                        </div>
                      </div>
                      {doc.pdfUrl && (
                        <a
                          href={doc.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center px-3 py-1 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition flex-shrink-0 ml-2"
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          View Document
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      )}
                    </button>

                    {/* Expanded content with summary level toggle */}
                    {isExpanded && (
                      <div className="p-4 bg-white border-t border-slate-200">
                        {/* Summary level toggle */}
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                          <span className="text-xs text-slate-500 font-medium">Detail:</span>
                          <div className="flex rounded-lg overflow-hidden border border-slate-200">
                            {(['headline', 'brief', 'detailed'] as SummaryLevel[]).map((level) => {
                              const levelConfig = SUMMARY_LEVEL_CONFIG[level];
                              const LevelIcon = levelConfig.icon;
                              const isActive = currentLevel === level;
                              const isAvailable = level === 'detailed' ||
                                (level === 'headline' && hasHeadline) ||
                                (level === 'brief' && hasBrief);

                              return (
                                <button
                                  key={level}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isAvailable) {
                                      setSummaryLevel(docKey, level);
                                    }
                                  }}
                                  disabled={!isAvailable}
                                  className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition ${
                                    isActive
                                      ? 'bg-emerald-600 text-white'
                                      : isAvailable
                                        ? 'bg-white text-slate-600 hover:bg-slate-50'
                                        : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                  }`}
                                  title={isAvailable ? levelConfig.description : 'Not available for this document'}
                                >
                                  <LevelIcon className="w-3 h-3" />
                                  {levelConfig.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Summary content */}
                        <div className="prose prose-sm prose-slate max-w-none">
                          <SummaryContent summary={getSummaryText(doc, currentLevel)} />
                        </div>

                        <p className="text-xs text-slate-400 mt-4 italic">
                          AI-generated summary. See official document for complete information.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState type={activeTab} />
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">About These Documents</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>SPLOST Reports</strong> show how Special Purpose Local Option Sales Tax funds
            are being spent on capital improvements and infrastructure.
          </p>
          <p>
            <strong>Public Notices</strong> are official city announcements about meetings, elections,
            and other civic matters.
          </p>
          <p>
            <strong>Strategic Plans</strong> outline the city&apos;s vision, goals, and planned initiatives.
          </p>
          <p>
            <strong>Water Quality Reports</strong> (CCR) provide annual information about your drinking water quality and safety.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryContent({ summary }: { summary: string }) {
  const lines = summary.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        // Headers with ###
        if (trimmed.startsWith('### ')) {
          const text = trimmed.slice(4);
          return (
            <h4 key={i} className="font-semibold text-slate-900 mt-4 first:mt-0">
              {text}
            </h4>
          );
        }

        // Headers (bold text with **)
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          const text = trimmed.slice(2, -2);
          return (
            <h4 key={i} className="font-semibold text-slate-900 mt-3 first:mt-0">
              {text}
            </h4>
          );
        }

        // Bullet points
        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const text = trimmed.replace(/^[•\-*]\s*/, '');
          const parts = text.split(/\*\*([^*]+)\*\*/g);
          return (
            <p key={i} className="text-sm text-slate-700 pl-4">
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
          <p key={i} className="text-sm text-slate-700">
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

function EmptyState({ type }: { type: DocType }) {
  const config = DOC_TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <div className="text-center py-12">
      <Icon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        No {config.label.toLowerCase()} summaries yet
      </h3>
      <p className="text-slate-500 mb-4">
        AI summaries for {config.label.toLowerCase()} haven&apos;t been generated yet.
      </p>
      <p className="text-sm text-slate-400">
        Use the <a href="/admin" className="text-emerald-600 hover:underline">admin panel</a> to generate summaries.
      </p>
    </div>
  );
}
