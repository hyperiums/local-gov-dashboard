'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SearchResults from '@/components/search/SearchResults';
import { Search, Loader2 } from 'lucide-react';
import { useSearch } from '@/hooks/useSearch';

function SearchPageContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  // Use shared search hook for debouncing and request cancellation
  const { query, setQuery, results, isLoading, hasSearched } = useSearch({
    debounceMs: 300,
    limit: 50,
    initialQuery,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <Search className="w-8 h-8 text-emerald-600" aria-hidden="true" />
          Search
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Search across meetings, ordinances, resolutions, and agenda items
        </p>
      </div>

      {/* Search Input */}
      <div className="mb-8">
        <label htmlFor="search-input" className="sr-only">
          Search query
        </label>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" aria-hidden="true" />
          <input
            id="search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search..."
            autoFocus
            className="w-full pl-12 pr-4 py-4 text-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
            aria-describedby="search-hint"
          />
          {isLoading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-600 animate-spin" aria-label="Searching" />
          )}
        </div>
        <p id="search-hint" className="mt-2 text-sm text-slate-500">
          Try searching for topics like &ldquo;zoning&rdquo;, &ldquo;budget&rdquo;, or ordinance numbers
        </p>
      </div>

      {/* Results */}
      {isLoading && !results && (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <span className="ml-3 text-slate-600 dark:text-slate-400">Searching...</span>
        </div>
      )}

      {!isLoading && hasSearched && results && (
        <SearchResults results={results} query={query} />
      )}

      {!hasSearched && !isLoading && (
        <div className="text-center py-12">
          <div className="text-slate-300 dark:text-slate-600 mb-4">
            <Search className="w-16 h-16 mx-auto" aria-hidden="true" />
          </div>
          <p className="text-slate-500">
            Enter a search term above to find content across the site
          </p>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
