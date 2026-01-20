/**
 * Full-text search functionality using SQLite FTS5
 *
 * This module implements a hybrid search strategy with two FTS5 indexes:
 * 1. search_index (porter stemmer) - Primary, for linguistic matching
 * 2. search_index_prefix (no stemmer) - Fallback, for prefix matching
 *
 * See the schema comments in db.ts for the full explanation of why we need both.
 */

import { getDb } from './db';

// =============================================================================
// Types
// =============================================================================

export interface SearchResult {
  entity_type: 'meeting' | 'ordinance' | 'resolution' | 'agenda_item';
  entity_id: string;
  title: string;
  snippet: string;
  rank: number;
  date: string | null;
}

export interface SearchResultsGrouped {
  meetings: SearchResult[];
  ordinances: SearchResult[];
  resolutions: SearchResult[];
  agenda_items: SearchResult[];
  total: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Strip markdown formatting from text for clean display in search snippets.
 * Removes bold, italic, headers, bullets, links, and inline code.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')     // Bold
    .replace(/\*([^*]+)\*/g, '$1')         // Italic
    .replace(/__([^_]+)__/g, '$1')         // Bold alt
    .replace(/_([^_]+)_/g, '$1')           // Italic alt
    .replace(/^#{1,6}\s+/gm, '')           // Headers
    .replace(/^[\s]*[-*+]\s+/gm, '')       // Bullets
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/`([^`]+)`/g, '$1')           // Inline code
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitize user input for safe FTS5 querying.
 * Removes FTS5 operators and special characters that could affect parsing.
 *
 * FTS5 special chars: " ' * - ^ : ( ) AND OR NOT NEAR
 *
 * @exported for testing
 */
export function sanitizeSearchTerms(query: string): string[] {
  return query
    .replace(/["']/g, '')           // Remove quotes to prevent injection
    .replace(/[*\-^:()]/g, ' ')     // Remove FTS5 operators
    .split(/\s+/)
    .filter(term => term.length > 0)
    .filter(term => !['AND', 'OR', 'NOT', 'NEAR'].includes(term.toUpperCase()));
}

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Search across all indexed content using a hybrid strategy.
 *
 * Phase 1: Search the stemmed index (search_index with porter tokenizer)
 *   - Handles linguistic variations: "budget" finds "budgets", "budgeting"
 *   - Best for complete words that users typically search for
 *
 * Phase 2 (fallback): If stemmed search returns 0 results, search prefix index
 *   - Handles partial words during typing: "zonin" finds "zoning"
 *   - The porter stemmer transforms "zonin" unpredictably, breaking prefix match
 *   - This fallback ensures search-as-you-type works reliably
 *
 * Why not just use prefix index for everything?
 *   - We'd lose stemming benefits: "budget" wouldn't find "budgets"
 *   - Stemming significantly improves recall for complete word searches
 *
 * The query uses a CTE to join dates from source tables in a single query,
 * avoiding N+1 database round-trips.
 */
export function search(
  query: string,
  options?: { limit?: number; type?: string }
): SearchResultsGrouped {
  const db = getDb();
  const limit = options?.limit || 50;

  const terms = sanitizeSearchTerms(query);

  if (terms.length === 0) {
    return { meetings: [], ordinances: [], resolutions: [], agenda_items: [], total: 0 };
  }

  // Build query for stemmed index (quotes + prefix for each term)
  const stemmedQuery = terms.map(term => `"${term}"*`).join(' ');

  // Build query for prefix index (just prefix matching, no quotes needed)
  const prefixQuery = terms.map(term => `${term}*`).join(' ');

  /**
   * Execute search with CTE to fetch dates in a single query.
   *
   * This avoids N+1 queries by joining all possible date sources upfront.
   * The CASE expression selects the appropriate date based on entity_type.
   */
  const executeSearch = (indexName: string, matchQuery: string) => {
    let typeFilter = '';
    const params: (string | number)[] = [matchQuery];

    if (options?.type) {
      typeFilter = 'AND s.entity_type = ?';
      params.push(options.type);
    }

    params.push(limit);

    const sql = `
      WITH search_results AS (
        SELECT
          entity_type,
          entity_id,
          title,
          snippet(${indexName}, 3, '<mark>', '</mark>', '...', 32) as snippet,
          bm25(${indexName}) as rank
        FROM ${indexName}
        WHERE ${indexName} MATCH ?
        ${typeFilter}
        ORDER BY rank
        LIMIT ?
      )
      SELECT
        s.entity_type,
        s.entity_id,
        s.title,
        s.snippet,
        s.rank,
        CASE s.entity_type
          WHEN 'meeting' THEN m.date
          WHEN 'ordinance' THEN COALESCE(o.adopted_date, o.introduced_date)
          WHEN 'resolution' THEN COALESCE(r.adopted_date, r.introduced_date)
          WHEN 'agenda_item' THEN am.date
        END as date
      FROM search_results s
      LEFT JOIN meetings m ON s.entity_type = 'meeting' AND s.entity_id = m.id
      LEFT JOIN ordinances o ON s.entity_type = 'ordinance' AND s.entity_id = o.id
      LEFT JOIN resolutions r ON s.entity_type = 'resolution' AND s.entity_id = r.id
      LEFT JOIN agenda_items ai ON s.entity_type = 'agenda_item' AND s.entity_id = ai.id
      LEFT JOIN meetings am ON s.entity_type = 'agenda_item' AND ai.meeting_id = am.id
      ORDER BY s.rank
    `;

    return db.prepare(sql).all(...params) as Array<{
      entity_type: string;
      entity_id: string;
      title: string;
      snippet: string;
      rank: number;
      date: string | null;
    }>;
  };

  // Phase 1: Try stemmed search first (better for complete words)
  let rawResults = executeSearch('search_index', stemmedQuery);

  // Phase 2: If no results, fallback to prefix search (better for partial words)
  if (rawResults.length === 0) {
    rawResults = executeSearch('search_index_prefix', prefixQuery);
  }

  // Transform and group results
  const results: SearchResult[] = rawResults.map(r => ({
    entity_type: r.entity_type as SearchResult['entity_type'],
    entity_id: r.entity_id,
    title: r.title,
    snippet: stripMarkdown(r.snippet),
    rank: r.rank,
    date: r.date,
  }));

  const grouped: SearchResultsGrouped = {
    meetings: [],
    ordinances: [],
    resolutions: [],
    agenda_items: [],
    total: results.length,
  };

  for (const r of results) {
    switch (r.entity_type) {
      case 'meeting':
        grouped.meetings.push(r);
        break;
      case 'ordinance':
        grouped.ordinances.push(r);
        break;
      case 'resolution':
        grouped.resolutions.push(r);
        break;
      case 'agenda_item':
        grouped.agenda_items.push(r);
        break;
    }
  }

  return grouped;
}

// =============================================================================
// Index Management
// =============================================================================

/**
 * Rebuild both search indexes from all existing data.
 * Call this after bulk data imports or to fix index corruption.
 *
 * Populates both the stemmed index (for linguistic matching) and
 * the prefix index (for partial word matching during typing).
 */
export function rebuildSearchIndex(): { indexed: number } {
  const db = getDb();

  // Clear both indexes
  db.exec('DELETE FROM search_index');
  db.exec('DELETE FROM search_index_prefix');

  let indexed = 0;

  // Prepare insert statements for BOTH indexes
  const insertStemmed = db.prepare(`
    INSERT INTO search_index (entity_type, entity_id, title, content)
    VALUES (?, ?, ?, ?)
  `);
  const insertPrefix = db.prepare(`
    INSERT INTO search_index_prefix (entity_type, entity_id, title, content)
    VALUES (?, ?, ?, ?)
  `);

  // Index meetings
  const meetings = db.prepare(`
    SELECT id, title, summary, agenda_summary, minutes_summary
    FROM meetings
    WHERE title IS NOT NULL
  `).all() as Array<{
    id: string;
    title: string;
    summary: string | null;
    agenda_summary: string | null;
    minutes_summary: string | null;
  }>;

  for (const m of meetings) {
    const content = [m.summary, m.agenda_summary, m.minutes_summary]
      .filter(Boolean)
      .join(' ');
    insertStemmed.run('meeting', m.id, m.title, content);
    insertPrefix.run('meeting', m.id, m.title, content);
    indexed++;
  }

  // Index ordinances
  const ordinances = db.prepare(`
    SELECT id, number, title, description, summary
    FROM ordinances
    WHERE title IS NOT NULL
  `).all() as Array<{
    id: string;
    number: string;
    title: string;
    description: string | null;
    summary: string | null;
  }>;

  for (const o of ordinances) {
    const displayTitle = `Ordinance ${o.number}: ${o.title}`;
    const content = [o.description, o.summary].filter(Boolean).join(' ');
    insertStemmed.run('ordinance', o.id, displayTitle, content);
    insertPrefix.run('ordinance', o.id, displayTitle, content);
    indexed++;
  }

  // Index resolutions
  const resolutions = db.prepare(`
    SELECT id, number, title, description, summary
    FROM resolutions
    WHERE title IS NOT NULL
  `).all() as Array<{
    id: string;
    number: string;
    title: string;
    description: string | null;
    summary: string | null;
  }>;

  for (const r of resolutions) {
    const displayTitle = `Resolution ${r.number}: ${r.title}`;
    const content = [r.description, r.summary].filter(Boolean).join(' ');
    insertStemmed.run('resolution', r.id, displayTitle, content);
    insertPrefix.run('resolution', r.id, displayTitle, content);
    indexed++;
  }

  // Index agenda items
  const agendaItems = db.prepare(`
    SELECT ai.id, ai.title, ai.description, ai.summary, m.date
    FROM agenda_items ai
    JOIN meetings m ON ai.meeting_id = m.id
    WHERE ai.title IS NOT NULL
  `).all() as Array<{
    id: string;
    title: string;
    description: string | null;
    summary: string | null;
    date: string;
  }>;

  for (const a of agendaItems) {
    const content = [a.description, a.summary].filter(Boolean).join(' ');
    insertStemmed.run('agenda_item', a.id, a.title, content);
    insertPrefix.run('agenda_item', a.id, a.title, content);
    indexed++;
  }

  return { indexed };
}

/**
 * Get statistics about the search index.
 */
export function getSearchIndexStats(): { total: number; byType: Record<string, number> } {
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) as count FROM search_index').get() as { count: number };
  const byType = db.prepare(`
    SELECT entity_type, COUNT(*) as count
    FROM search_index
    GROUP BY entity_type
  `).all() as Array<{ entity_type: string; count: number }>;

  return {
    total: total.count,
    byType: byType.reduce((acc, row) => {
      acc[row.entity_type] = row.count;
      return acc;
    }, {} as Record<string, number>),
  };
}
