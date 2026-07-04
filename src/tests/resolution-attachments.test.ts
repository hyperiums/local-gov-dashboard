import { describe, it, expect } from 'vitest';
import { classifyResolutionAttachments } from '@/lib/scraper/resolutions';

// Real CivicClerk sidebar text (event 42, March 19 2026) captured from the
// portal. The city names resolution files by TOPIC, not number, so the
// number-based matcher used to miss them entirely.
const EVENT_42_SIDEBAR = [
  'b. Consider Resolution 26-006, to Appoint Whitnie Riden as Assistant Solicitor',
  'Resolution assistant solicitor',
  'Executive Summary - for resolution for solicitor',
  'c. Consider Resolution 26-007, to Appoint Benjamin Mozingo as Public Defender',
  'Resolution for Public Defender',
  'Executive Summary - for resolution for public defender',
  'd. Consideration of a Pre-Development Agreement with Penn Hodge Properties for the Old Town Redevelopment Project',
];

describe('classifyResolutionAttachments', () => {
  it('finds a topic-named resolution PDF within its agenda section (26-006)', () => {
    const found = classifyResolutionAttachments(EVENT_42_SIDEBAR, '26-006');
    expect(found).toEqual([
      { text: 'Resolution assistant solicitor', type: 'resolution' },
      { text: 'Executive Summary - for resolution for solicitor', type: 'staffReport' },
    ]);
  });

  it('does not bleed into the next resolution section (26-007)', () => {
    const found = classifyResolutionAttachments(EVENT_42_SIDEBAR, '26-007');
    expect(found).toEqual([
      { text: 'Resolution for Public Defender', type: 'resolution' },
      { text: 'Executive Summary - for resolution for public defender', type: 'staffReport' },
    ]);
  });

  it('still matches number-named resolution files (regression)', () => {
    const numbered = [
      'a. Consider Resolution 26-020 for the Millage Rate',
      'Resolution No. 26-020',
      'Executive Summary for Resolution 26-020',
      'b. Consider something else',
    ];
    const found = classifyResolutionAttachments(numbered, '26-020');
    expect(found).toContainEqual({ text: 'Resolution No. 26-020', type: 'resolution' });
    expect(found).toContainEqual({ text: 'Executive Summary for Resolution 26-020', type: 'staffReport' });
  });

  it('still matches the legacy zero-prefixed naming', () => {
    const legacy = [
      'a. Consider Resolution 24-003',
      '00 - Resolution 24-003 Signed',
      'b. Next item',
    ];
    const found = classifyResolutionAttachments(legacy, '24-003');
    expect(found).toEqual([{ text: '00 - Resolution 24-003 Signed', type: 'resolution' }]);
  });

  it('matches a resolution file with "Resolution" at the END of the name (26-010)', () => {
    // Real event-46 sidebar: the resolution word trails, and the "Final
    // Draft" comp-plan doc must NOT be picked up as the resolution
    const sidebar = [
      'a. Consider Resolution 26-010 Adopting the City of Flowery Branch Comprehensive Plan',
      'Final Draft - for May 21st',
      'Flowery Branch 2026 Comp Plan Adoption Resolution',
      'b. Alcohol Ordinance Discussion',
    ];
    const found = classifyResolutionAttachments(sidebar, '26-010');
    expect(found).toEqual([
      { text: 'Flowery Branch 2026 Comp Plan Adoption Resolution', type: 'resolution' },
    ]);
  });

  it('matches a mid-name resolution and abbreviated "ES -" summary (26-013)', () => {
    // Real event-71 sidebar: file numbered 2026-013 (4-digit year), and
    // the exec summary is abbreviated "ES -"
    const sidebar = [
      'e. Consider Resolution 26-013: Reimbursement Resolution for Acquisition of Old Town Project',
      'ES - Reimbursement Resolution TAD Bond Funds',
      'REIMBURSEMENT RESOLUTION - 2026-013',
      'a. City Manager Report',
    ];
    const found = classifyResolutionAttachments(sidebar, '26-013');
    expect(found).toEqual([
      { text: 'ES - Reimbursement Resolution TAD Bond Funds', type: 'staffReport' },
      { text: 'REIMBURSEMENT RESOLUTION - 2026-013', type: 'resolution' },
    ]);
  });

  it('returns nothing when the resolution is not in the sidebar', () => {
    expect(classifyResolutionAttachments(EVENT_42_SIDEBAR, '26-099')).toEqual([]);
  });

  it('classifies an executive summary as staffReport, not resolution', () => {
    const found = classifyResolutionAttachments(EVENT_42_SIDEBAR, '26-006');
    const summary = found.find(a => a.text.startsWith('Executive Summary'));
    expect(summary?.type).toBe('staffReport');
  });
});
