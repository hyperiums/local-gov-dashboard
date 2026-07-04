import { describe, it, expect } from 'vitest';
import { selectOrdinancesForSummarization } from '@/lib/scraper/municode';

// The production cron runs generate-ordinance-summaries with limit 10.
// Ordinances auto-created from agenda items have no municode_url until the
// Municode scrape enriches them, so they can never be summarized as-is.
// Selection must skip them or they permanently consume batch slots.

function ord(overrides: {
  number: string;
  summary?: string | null;
  municode_url?: string | null;
}) {
  return {
    number: overrides.number,
    summary: overrides.summary ?? null,
    municode_url: overrides.municode_url ?? null,
  };
}

const municodeUrl = (nodeId: string) =>
  `https://library.municode.com/ga/flowery_branch/ordinances/code_of_ordinances?nodeId=${nodeId}`;

describe('selectOrdinancesForSummarization', () => {
  it('excludes ordinances without a municode_url', () => {
    const selected = selectOrdinancesForSummarization(
      [ord({ number: '784' }), ord({ number: '767', municode_url: municodeUrl('1396388') })],
      { limit: 10 }
    );

    expect(selected.map(o => o.number)).toEqual(['767']);
  });

  it('excludes ordinances whose municode_url has no nodeId parameter', () => {
    const selected = selectOrdinancesForSummarization(
      [
        ord({ number: '757', municode_url: 'https://library.municode.com/ga/flowery_branch' }),
        ord({ number: '766', municode_url: municodeUrl('1387074') }),
      ],
      { limit: 10 }
    );

    expect(selected.map(o => o.number)).toEqual(['766']);
  });

  it('skips ordinances that already have a summary', () => {
    const selected = selectOrdinancesForSummarization(
      [
        ord({ number: '767', municode_url: municodeUrl('1396388'), summary: 'done' }),
        ord({ number: '766', municode_url: municodeUrl('1387074') }),
      ],
      { limit: 10 }
    );

    expect(selected.map(o => o.number)).toEqual(['766']);
  });

  it('does not let unsummarizable ordinances consume limit slots', () => {
    // Mirrors the Jul 1 2026 prod run: 7 agenda-created rows sorted first
    // squeezed real work down to 3 of 10 slots
    const agendaCreated = ['784', '762', '761', '760', '759', '758', '757'].map(n =>
      ord({ number: n })
    );
    const summarizable = ['752', '751', '746', '737'].map(n =>
      ord({ number: n, municode_url: municodeUrl(`node-${n}`.replace(/\D/g, '')) })
    );

    const selected = selectOrdinancesForSummarization(
      [...agendaCreated, ...summarizable],
      { limit: 3 }
    );

    expect(selected.map(o => o.number)).toEqual(['752', '751', '746']);
  });

  it('includes already-summarized ordinances when forceRefresh is set, still excluding unsummarizable ones', () => {
    const selected = selectOrdinancesForSummarization(
      [
        ord({ number: '784' }),
        ord({ number: '767', municode_url: municodeUrl('1396388'), summary: 'done' }),
        ord({ number: '766', municode_url: municodeUrl('1387074') }),
      ],
      { limit: 10, forceRefresh: true }
    );

    expect(selected.map(o => o.number)).toEqual(['767', '766']);
  });
});
