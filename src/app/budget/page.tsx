'use client';

import { useState, useEffect } from 'react';
import { BarChart3, ExternalLink, FileText, Sparkles, ChevronDown, ChevronRight, ClipboardCheck } from 'lucide-react';
import { getClearGovSpendingUrl } from '@/lib/dates';

interface BudgetSummary {
  fiscalYear: string;
  summary: string;
  pdfUrl: string | null;
}

interface AuditSummary {
  fiscalYear: string;
  summary: string;
  pdfUrl: string | null;
  title: string | null;
}

export default function BudgetPage() {
  const [budgetSummaries, setBudgetSummaries] = useState<BudgetSummary[]>([]);
  const [auditSummaries, setAuditSummaries] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'budgets' | 'audits'>('budgets');

  useEffect(() => {
    async function loadData() {
      try {
        const [budgetRes, auditRes] = await Promise.all([
          fetch('/api/data?type=budget-summaries'),
          fetch('/api/data?type=audit-summaries'),
        ]);
        const budgetData = await budgetRes.json();
        const auditData = await auditRes.json();

        setBudgetSummaries(budgetData.summaries || []);
        setAuditSummaries(auditData.summaries || []);

        // Auto-expand the most recent year from each category
        const recentBudget = (budgetData.summaries || [])[0]?.fiscalYear;
        const recentAudit = (auditData.summaries || [])[0]?.fiscalYear;
        const toExpand = [
          recentBudget ? `budget-${recentBudget}` : null,
          recentAudit ? `audit-${recentAudit}` : null,
        ].filter(Boolean) as string[];
        setExpandedYears(new Set(toExpand));
      } catch (error) {
        console.error('Failed to load budget data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const toggleYear = (key: string) => {
    const newExpanded = new Set(expandedYears);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedYears(newExpanded);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center">
            <BarChart3 className="w-8 h-8 mr-3 text-emerald-500" />
            City Budget & Finances
          </h1>
          <p className="text-slate-600 mt-1">
            Annual budgets and financial reports for Flowery Branch
          </p>
        </div>
        <a
          href={getClearGovSpendingUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
        >
          Explore on ClearGov
          <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('budgets')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'budgets'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4 inline mr-2" />
          Annual Budgets ({budgetSummaries.length})
        </button>
        <button
          onClick={() => setActiveTab('audits')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'audits'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ClipboardCheck className="w-4 h-4 inline mr-2" />
          Financial Reports ({auditSummaries.length})
        </button>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="p-4 border-b border-slate-200">
          {activeTab === 'budgets' ? (
            <>
              <h2 className="font-semibold text-slate-900">Annual Operating & Capital Budgets</h2>
              <p className="text-sm text-slate-500 mt-1">
                What the city plans to spend each fiscal year — AI-generated summaries of approved budgets
              </p>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-slate-900">Annual Comprehensive Financial Reports</h2>
              <p className="text-sm text-slate-500 mt-1">
                Audited results of actual city spending — AI-generated summaries of official financial reports
              </p>
            </>
          )}
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-slate-500 mt-4">Loading financial data...</p>
            </div>
          ) : activeTab === 'budgets' ? (
            budgetSummaries.length > 0 ? (
              <div className="space-y-3">
                {budgetSummaries.map((item) => (
                  <div key={`budget-${item.fiscalYear}`} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleYear(`budget-${item.fiscalYear}`)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition"
                    >
                      <div className="flex items-center">
                        {expandedYears.has(`budget-${item.fiscalYear}`) ? (
                          <ChevronDown className="w-4 h-4 text-slate-500 mr-2" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500 mr-2" />
                        )}
                        <span className="font-medium text-slate-900">{item.fiscalYear} Budget</span>
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI Summary
                        </span>
                      </div>
                      {item.pdfUrl && (
                        <a
                          href={item.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center px-3 py-1 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition"
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          View Budget
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      )}
                    </button>
                    {expandedYears.has(`budget-${item.fiscalYear}`) && (
                      <div className="p-4 bg-white border-t border-slate-200">
                        <div className="prose prose-sm prose-slate max-w-none">
                          <SummaryContent summary={item.summary} />
                        </div>
                        <p className="text-xs text-slate-400 mt-4 italic">
                          AI-generated summary. See official budget document for complete information.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState type="budgets" />
            )
          ) : (
            auditSummaries.length > 0 ? (
              <div className="space-y-3">
                {auditSummaries.map((item) => (
                  <div key={`audit-${item.fiscalYear}`} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleYear(`audit-${item.fiscalYear}`)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition"
                    >
                      <div className="flex items-center">
                        {expandedYears.has(`audit-${item.fiscalYear}`) ? (
                          <ChevronDown className="w-4 h-4 text-slate-500 mr-2" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500 mr-2" />
                        )}
                        <span className="font-medium text-slate-900">
                          {item.title || `FY${item.fiscalYear} Financial Report`}
                        </span>
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI Summary
                        </span>
                      </div>
                      {item.pdfUrl && (
                        <a
                          href={item.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center px-3 py-1 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition"
                        >
                          <FileText className="w-4 h-4 mr-1" />
                          View Report
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      )}
                    </button>
                    {expandedYears.has(`audit-${item.fiscalYear}`) && (
                      <div className="p-4 bg-white border-t border-slate-200">
                        <div className="prose prose-sm prose-slate max-w-none">
                          <SummaryContent summary={item.summary} />
                        </div>
                        <p className="text-xs text-slate-400 mt-4 italic">
                          AI-generated summary. See official financial report for complete information.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState type="audits" />
            )
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">Understanding City Financial Documents</h3>
        <div className="text-sm text-blue-800 space-y-3">
          <p>
            <strong>Annual Budgets</strong> show what the city <em>plans</em> to spend each fiscal year.
            These documents are approved by the City Council and detail projected spending on city services,
            infrastructure projects, and operations.
          </p>
          <p>
            <strong>Annual Comprehensive Financial Reports (ACFRs)</strong> show what <em>actually</em> happened.
            These audited reports are prepared after the fiscal year ends and include independently verified
            financial statements, auditor opinions, and detailed analysis of the city&apos;s financial health.
          </p>
          <p>
            For interactive budget exploration and detailed spending data, visit{' '}
            <a
              href="https://cleargov.com/georgia/hall/city/flowery-branch"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              ClearGov
            </a>.
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

        // Headers with ### (h3)
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

function EmptyState({ type }: { type: 'budgets' | 'audits' }) {
  return (
    <div className="text-center py-12">
      {type === 'budgets' ? (
        <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
      ) : (
        <ClipboardCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
      )}
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        {type === 'budgets' ? 'No budget summaries yet' : 'No audit summaries yet'}
      </h3>
      <p className="text-slate-500 mb-4">
        {type === 'budgets'
          ? "AI summaries for annual budgets haven't been generated yet."
          : "AI summaries for financial reports haven't been generated yet."}
      </p>
      <p className="text-sm text-slate-400">
        Use the <a href="/admin" className="text-emerald-600 hover:underline">admin panel</a> to generate summaries.
      </p>
    </div>
  );
}
