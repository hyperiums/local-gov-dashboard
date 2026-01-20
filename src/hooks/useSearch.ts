'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SearchResultsGrouped } from '@/lib/search';

interface UseSearchOptions {
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Maximum results to fetch (default: 20) */
  limit?: number;
  /** Initial query value */
  initialQuery?: string;
}

interface UseSearchResult {
  /** Current search query */
  query: string;
  /** Set the search query */
  setQuery: (query: string) => void;
  /** Search results (null if no search performed) */
  results: SearchResultsGrouped | null;
  /** Whether a search is in progress */
  isLoading: boolean;
  /** Whether any search has been performed */
  hasSearched: boolean;
  /** Flattened results array for keyboard navigation */
  flatResults: Array<{
    entity_type: 'meeting' | 'ordinance' | 'resolution' | 'agenda_item';
    entity_id: string;
    title: string;
    snippet: string;
    rank: number;
    date: string | null;
  }>;
  /** Clear search state */
  clear: () => void;
}

/**
 * Hook for search functionality with debouncing and request cancellation.
 *
 * Features:
 * - Debounced API calls to avoid excessive requests while typing
 * - Automatic request cancellation when query changes (prevents race conditions)
 * - Loading and searched state tracking
 * - Flattened results for keyboard navigation
 *
 * @example
 * ```tsx
 * const { query, setQuery, results, isLoading } = useSearch({ debounceMs: 300 });
 *
 * return (
 *   <input value={query} onChange={(e) => setQuery(e.target.value)} />
 * );
 * ```
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchResult {
  const { debounceMs = 300, limit = 20, initialQuery = '' } = options;

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResultsGrouped | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Track the latest query to avoid stale closures
  const latestQueryRef = useRef(query);
  latestQueryRef.current = query;

  // Search effect with debounce and request cancellation
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setHasSearched(false);
      return;
    }

    const abortController = new AbortController();

    const debounceTimer = setTimeout(async () => {
      setIsLoading(true);
      setHasSearched(true);

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
          { signal: abortController.signal }
        );

        if (res.ok) {
          const data = await res.json();
          // Only update if this is still the current query
          if (latestQueryRef.current === query) {
            setResults(data.results);
          }
        }
      } catch (error) {
        // Ignore abort errors - they're expected when query changes
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error('Search error:', error);
      } finally {
        // Only clear loading if not aborted
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(debounceTimer);
      abortController.abort();
    };
  }, [query, limit, debounceMs]);

  // Flatten results for keyboard navigation
  const flatResults = results
    ? [
        ...results.meetings,
        ...results.ordinances,
        ...results.resolutions,
        ...results.agenda_items,
      ]
    : [];

  const clear = useCallback(() => {
    setQuery('');
    setResults(null);
    setHasSearched(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    hasSearched,
    flatResults,
    clear,
  };
}
