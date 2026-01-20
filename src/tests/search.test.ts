import { describe, it, expect } from 'vitest';
import { sanitizeSearchTerms } from '@/lib/search';

describe('sanitizeSearchTerms', () => {
  describe('basic functionality', () => {
    it('splits query into terms', () => {
      expect(sanitizeSearchTerms('hello world')).toEqual(['hello', 'world']);
    });

    it('handles multiple spaces', () => {
      expect(sanitizeSearchTerms('hello   world')).toEqual(['hello', 'world']);
    });

    it('trims leading and trailing whitespace', () => {
      expect(sanitizeSearchTerms('  hello world  ')).toEqual(['hello', 'world']);
    });

    it('returns empty array for empty input', () => {
      expect(sanitizeSearchTerms('')).toEqual([]);
      expect(sanitizeSearchTerms('   ')).toEqual([]);
    });
  });

  describe('FTS5 operator removal (security)', () => {
    it('removes double quotes', () => {
      // Quotes can be used for phrase matching - could enable injection
      expect(sanitizeSearchTerms('"exact phrase"')).toEqual(['exact', 'phrase']);
    });

    it('removes single quotes', () => {
      expect(sanitizeSearchTerms("it's a test")).toEqual(['its', 'a', 'test']);
    });

    it('removes asterisks (prefix operator)', () => {
      // * is the prefix operator in FTS5
      expect(sanitizeSearchTerms('test*')).toEqual(['test']);
      expect(sanitizeSearchTerms('*test')).toEqual(['test']);
    });

    it('removes hyphen/minus (NOT operator)', () => {
      // -term means NOT in FTS5
      expect(sanitizeSearchTerms('cats -dogs')).toEqual(['cats', 'dogs']);
    });

    it('removes caret (boost operator)', () => {
      // ^weight boosts terms in FTS5 - caret becomes space, splitting the term
      expect(sanitizeSearchTerms('important^2')).toEqual(['important', '2']);
    });

    it('removes colon (column filter)', () => {
      // column:term filters by column in FTS5
      expect(sanitizeSearchTerms('title:zoning')).toEqual(['title', 'zoning']);
    });

    it('removes parentheses (grouping)', () => {
      expect(sanitizeSearchTerms('(cats OR dogs)')).toEqual(['cats', 'dogs']);
    });
  });

  describe('FTS5 keyword removal (security)', () => {
    it('removes AND operator', () => {
      expect(sanitizeSearchTerms('cats AND dogs')).toEqual(['cats', 'dogs']);
    });

    it('removes OR operator', () => {
      expect(sanitizeSearchTerms('cats OR dogs')).toEqual(['cats', 'dogs']);
    });

    it('removes NOT operator', () => {
      expect(sanitizeSearchTerms('cats NOT dogs')).toEqual(['cats', 'dogs']);
    });

    it('removes NEAR operator', () => {
      // NEAR/n matches terms within n tokens
      expect(sanitizeSearchTerms('cats NEAR dogs')).toEqual(['cats', 'dogs']);
    });

    it('handles operators case-insensitively', () => {
      expect(sanitizeSearchTerms('cats and dogs')).toEqual(['cats', 'dogs']);
      expect(sanitizeSearchTerms('cats And dogs')).toEqual(['cats', 'dogs']);
      expect(sanitizeSearchTerms('cats or dogs')).toEqual(['cats', 'dogs']);
      expect(sanitizeSearchTerms('cats not dogs')).toEqual(['cats', 'dogs']);
      expect(sanitizeSearchTerms('cats near dogs')).toEqual(['cats', 'dogs']);
    });
  });

  describe('real-world inputs', () => {
    it('handles typical search queries', () => {
      expect(sanitizeSearchTerms('zoning ordinance')).toEqual(['zoning', 'ordinance']);
      expect(sanitizeSearchTerms('budget 2024')).toEqual(['budget', '2024']);
      expect(sanitizeSearchTerms('city council meeting')).toEqual(['city', 'council', 'meeting']);
    });

    it('handles ordinance numbers', () => {
      expect(sanitizeSearchTerms('ordinance 773')).toEqual(['ordinance', '773']);
      expect(sanitizeSearchTerms('ORD-2024-001')).toEqual(['ORD', '2024', '001']);
    });

    it('handles attempted FTS5 injection', () => {
      // Attacker trying to use FTS5 syntax
      expect(sanitizeSearchTerms('"cats" OR title:dogs')).toEqual(['cats', 'title', 'dogs']);
      expect(sanitizeSearchTerms('test* AND -excluded')).toEqual(['test', 'excluded']);
      // NEAR/5 stays as one token (slash isn't stripped), but it won't match the NEAR keyword
      // since it's "NEAR/5" not "NEAR" - FTS5 won't interpret it as the proximity operator
      expect(sanitizeSearchTerms('term1 NEAR/5 term2')).toEqual(['term1', 'NEAR/5', 'term2']);
    });
  });
});

/**
 * Integration test notes for hybrid search fallback:
 *
 * The hybrid search strategy works as follows:
 * 1. Primary search uses porter stemmer index (search_index)
 *    - "budget" matches "budgets", "budgeting" (stemming)
 *    - Complete words work best
 *
 * 2. Fallback search uses prefix-only index (search_index_prefix)
 *    - "zonin" matches "zoning" via prefix
 *    - Triggered ONLY when stemmed search returns 0 results
 *
 * Why this matters (the bug we fixed):
 * - Porter stemmer transforms "zonin" unpredictably, breaking prefix match
 * - Without fallback, "zonin" returned 0 results while "zoning" worked
 * - The fallback ensures search-as-you-type works for partial words
 *
 * To fully test this requires database integration tests with actual FTS5.
 * Manual verification steps:
 * 1. Search "zonin" → should return results (via prefix fallback)
 * 2. Search "zoning" → should return results (via stemmed index)
 * 3. Search "budget" → should find "budgets" (via stemmed index)
 */
