'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';
import { formatDate } from '@/lib/dates';

interface SearchInputProps {
  variant?: 'header' | 'page';
  autoFocus?: boolean;
  onResultSelect?: () => void;
}

// Result type for navigation (matches what useSearch returns)
interface SearchResult {
  entity_type: 'meeting' | 'ordinance' | 'resolution' | 'agenda_item';
  entity_id: string;
  title: string;
  snippet: string;
  rank: number;
  date: string | null;
}

export default function SearchInput({ variant = 'header', autoFocus = false, onResultSelect }: SearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Use shared search hook for debouncing and request cancellation
  const { query, setQuery, results, isLoading, flatResults, clear } = useSearch({
    debounceMs: 300,
    limit: 20,
  });

  // Open modal on Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Auto focus for page variant
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Reset selected index when results change (React-recommended pattern:
  // adjust state during rendering instead of using an effect)
  const [prevResults, setPrevResults] = useState(results);
  if (results !== prevResults) {
    setPrevResults(results);
    setSelectedIndex(-1);
  }

  // Handle result navigation
  const navigateToResult = useCallback((result: SearchResult) => {
    let url = '/';
    switch (result.entity_type) {
      case 'meeting':
        url = `/meetings#${result.entity_id}`;
        break;
      case 'ordinance':
        url = `/ordinances#${result.entity_id}`;
        break;
      case 'resolution':
        url = `/resolutions#${result.entity_id}`;
        break;
      case 'agenda_item':
        // Agenda items link to their meeting
        url = `/meetings`;
        break;
    }
    router.push(url);
    setIsOpen(false);
    clear();
    onResultSelect?.();
  }, [router, onResultSelect, clear]);

  // Keyboard navigation in results
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      navigateToResult(flatResults[selectedIndex]);
    } else if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      router.push(`/search?q=${encodeURIComponent(query)}`);
      setIsOpen(false);
    }
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Get type label for display
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'meeting': return 'Meeting';
      case 'ordinance': return 'Ordinance';
      case 'resolution': return 'Resolution';
      case 'agenda_item': return 'Agenda Item';
      default: return type;
    }
  };

  // Get type color
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'meeting': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'ordinance': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300';
      case 'resolution': return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
      case 'agenda_item': return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  // Header variant - just the trigger button
  if (variant === 'header') {
    return (
      <>
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition text-white/80 hover:text-white"
          aria-label="Open search (Cmd+K)"
          aria-keyshortcuts="Control+k Meta+k"
        >
          <Search className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Search Modal */}
        {isOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <div
              ref={dialogRef}
              className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden ring-1 ring-black/5 dark:ring-white/10"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <Search className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search meetings, ordinances, resolutions..."
                  className="flex-1 py-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none text-lg"
                  aria-label="Search query"
                  aria-autocomplete="list"
                  aria-controls="search-results"
                  aria-activedescendant={selectedIndex >= 0 ? `result-${selectedIndex}` : undefined}
                />
                {isLoading && <Loader2 className="w-5 h-5 text-slate-400 animate-spin shrink-0" aria-label="Loading" />}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition shrink-0"
                  aria-label="Close search"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Results */}
              <div
                id="search-results"
                role="listbox"
                className="max-h-[60vh] overflow-y-auto"
                aria-label="Search results"
              >
                {/* Empty state - no query yet */}
                {!query && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-slate-500 dark:text-slate-400">
                      Search across meetings, ordinances, and resolutions
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                      Try &ldquo;zoning&rdquo;, &ldquo;budget 2024&rdquo;, or &ldquo;council meeting&rdquo;
                    </p>
                  </div>
                )}

                {/* No results found */}
                {query && !isLoading && results && results.total === 0 && (
                  <div className="px-4 py-8 text-center text-slate-500">
                    No results found for &ldquo;{query}&rdquo;
                  </div>
                )}

                {results && results.total > 0 && (
                  <div className="py-2">
                    {flatResults.map((result, index) => (
                      <button
                        key={`${result.entity_type}-${result.entity_id}`}
                        id={`result-${index}`}
                        role="option"
                        aria-selected={index === selectedIndex}
                        onClick={() => navigateToResult(result)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          index === selectedIndex
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-emerald-500'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-transparent'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-24 shrink-0 flex flex-col items-start gap-1">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md ${getTypeColor(result.entity_type)}`}>
                              {getTypeLabel(result.entity_type)}
                            </span>
                            {result.date && (
                              <span className="text-xs text-slate-400">
                                {formatDate(result.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 dark:text-white truncate">
                              {result.title}
                            </div>
                            {result.snippet && (
                              /**
                               * SECURITY: Safe to use dangerouslySetInnerHTML here because:
                               * 1. The <mark> tags are generated by our FTS5 snippet() function
                               * 2. The underlying content comes from our own database
                               * 3. User input cannot inject HTML - it's sanitized before FTS5 indexing
                               * 4. The stripMarkdown() function in search.ts removes markdown but preserves <mark>
                               */
                              <div
                                className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mt-1"
                                dangerouslySetInnerHTML={{ __html: result.snippet }}
                              />
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Footer with hint - only show when there are results or user is typing */}
                {(query || (results && results.total > 0)) && (
                  <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 text-xs text-slate-500">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-3">
                        <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md font-mono text-[10px] shadow-sm">↑↓</kbd> navigate</span>
                        <span><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md font-mono text-[10px] shadow-sm">↵</kbd> select</span>
                      </span>
                      <span>
                        <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md font-mono text-[10px] shadow-sm">esc</kbd> close
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Page variant - full width input
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search meetings, ordinances, resolutions..."
          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          aria-label="Search query"
          aria-autocomplete="list"
          aria-controls="page-search-results"
          aria-activedescendant={selectedIndex >= 0 ? `page-result-${selectedIndex}` : undefined}
        />
        {isLoading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" aria-label="Loading" />
        )}
      </div>

      {/* Inline results for page variant */}
      {query && results && (
        <div
          id="page-search-results"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-[60vh] overflow-y-auto z-10"
          aria-label="Search results"
        >
          {results.total === 0 && !isLoading && (
            <div className="px-4 py-8 text-center text-slate-500">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {results.total > 0 && (
            <div className="py-2">
              {flatResults.map((result, index) => (
                <button
                  key={`${result.entity_type}-${result.entity_id}`}
                  id={`page-result-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => navigateToResult(result)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition ${
                    index === selectedIndex ? 'bg-slate-100 dark:bg-slate-800' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${getTypeColor(result.entity_type)}`}>
                      {getTypeLabel(result.entity_type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 dark:text-white truncate">
                        {result.title}
                      </div>
                      {result.snippet && (
                        /**
                         * SECURITY: Safe to use dangerouslySetInnerHTML here because:
                         * 1. The <mark> tags are generated by our FTS5 snippet() function
                         * 2. The underlying content comes from our own database
                         * 3. User input cannot inject HTML - it's sanitized before FTS5 indexing
                         * 4. The stripMarkdown() function in search.ts removes markdown but preserves <mark>
                         */
                        <div
                          className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mt-1"
                          dangerouslySetInnerHTML={{ __html: result.snippet }}
                        />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
