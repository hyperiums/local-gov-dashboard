import { describe, it, expect } from 'vitest';
import {
  extractOrdinanceNumbers,
  extractResolutionNumbers,
  classifyReading,
  resolveOrdinanceVote,
} from '@/lib/ordinanceRefs';

// Every string below is a verbatim agenda-item or motion title pulled from
// Flowery Branch CivicClerk events, so these cases pin the shapes the city
// actually publishes rather than shapes we imagine it might.
describe('extractOrdinanceNumbers', () => {
  it('reads a single plainly numbered ordinance', () => {
    expect(
      extractOrdinanceNumbers('First Read to Consider Ordinance 784 for Rezoning of 4651 and 4665 Hog Mountain Road')
    ).toEqual(['784']);
  });

  it('reads the "No." form', () => {
    expect(extractOrdinanceNumbers('Ordinance No. 779')).toEqual(['779']);
  });

  it('reads a plural item carrying several numbers', () => {
    expect(
      extractOrdinanceNumbers('City Clerk Cooper read the captions for Ordinances 774, 775, and 776.')
    ).toEqual(['774', '775', '776']);
  });

  // The June 18 / July 15 zoning-condition amendments. The old pattern required
  // whitespace directly after "Ordinance", so the plural "Ordinances" matched
  // nothing at all and both numbers went missing from the site.
  it('reads plural, letter-suffixed numbers joined by "and"', () => {
    expect(
      extractOrdinanceNumbers(
        'Second Read for Consideration of Ordinances 702-A and 715-A to Modify Rezoning Approval Conditions at Hemingway Subdivision Concerning Perimeter Fencing'
      )
    ).toEqual(['702-A', '715-A']);
  });

  // CivicClerk emits U+2011 (non-breaking hyphen) here, not ASCII '-'.
  it('reads slash-joined numbers written with a non-breaking hyphen', () => {
    expect(
      extractOrdinanceNumbers(
        'Second Read to Consider Proposed Amendments to the Planned Unit Development (PUD) Conditions, Applicable to the Commercial Use Section of Sterling on the Lake, Pursuant to Ordinance 239‑N / 240‑N.'
      )
    ).toEqual(['239-N', '240-N']);
  });

  it('stops at the first non-number word instead of swallowing street numbers', () => {
    expect(
      extractOrdinanceNumbers('Ordinance 776 Variances at 4651 and 4665 Hog Mountain Road')
    ).toEqual(['776']);
  });

  it('does not treat a following capitalised word as a letter suffix', () => {
    expect(extractOrdinanceNumbers('Ordinance 764 Millage Rate 2025 - 3.247 millage rate')).toEqual(['764']);
  });

  it('returns nothing for discussion items that name no number', () => {
    expect(extractOrdinanceNumbers('Alcohol Ordinance Discussion')).toEqual([]);
  });
});

describe('extractResolutionNumbers', () => {
  it('reads the year-prefixed form', () => {
    expect(
      extractResolutionNumbers('Consider Resolution 26-014 To Call for a Special Election To Fill City Council Post Three Vacancy')
    ).toEqual(['26-014']);
  });

  it('reads the "Number" form', () => {
    expect(extractResolutionNumbers('Consider Resolution Number 26-015 Amendment to Installment Sale Agreement')).toEqual([
      '26-015',
    ]);
  });
});

describe('classifyReading', () => {
  // The city writes both "Second Reading of" and "Second Read to Consider".
  // Only the first form used to be recognised, so second reads never adopted.
  it('recognises "Second Reading of"', () => {
    expect(classifyReading('a. Consider Second Reading of Ordinance 778 for Text Amendments to Article 37')).toBe('second');
  });

  it('recognises "Second Read to Consider"', () => {
    expect(classifyReading('a. Second Read to Consider Ordinance 786 to Add a Definition for Mixed-Use Residential')).toBe(
      'second'
    );
  });

  it('recognises "Second Read for Consideration of"', () => {
    expect(classifyReading('Second Read for Consideration of Ordinances 702-A and 715-A')).toBe('second');
  });

  it('recognises first reads in both spellings', () => {
    expect(classifyReading('a. Consider First Reading of Ordinance 774 for Annexation')).toBe('first');
    expect(classifyReading('b. First Read to Consider Ordinance 786 to Add a Definition')).toBe('first');
    expect(classifyReading('Public Hearing and First Read for Consideration of Ordinances 702-A and 715-A')).toBe('first');
  });

  // Staff routinely recommend "advancing X to a Second Reading" inside an item
  // that is itself the first read. Whichever marker comes first wins, so the
  // item is not mistaken for an adoption vote.
  it('treats an item as a first read when the first-read marker comes first', () => {
    expect(
      classifyReading('First Read to Consider Ordinance 786; staff recommends advancing Ordinance 786 to a Second Reading')
    ).toBe('first');
  });

  it('returns null when the item is not a reading', () => {
    expect(classifyReading('Consider Awarding Contract to Yellowstone Landscape, LLC')).toBe(null);
  });
});

// The motion/result pairs below are all recorded on real Flowery Branch
// meeting-overview pages. The council uses "Advance" as often as "Approve" for
// a reading, and a motion to *deny* that fails means the ordinance survived —
// reading either one as a plain outcome mislabels the record.
describe('resolveOrdinanceVote', () => {
  it('treats an approved second reading as adoption', () => {
    expect(
      resolveOrdinanceVote({
        motion: 'Approve',
        result: 'passed',
        itemTitle: 'a. Second Read to Consider Ordinance 786 to Add a Definition for Mixed-Use Residential',
      })
    ).toEqual({ action: 'adopted', newStatus: 'adopted', verified: true });
  });

  it('treats an advanced first reading as a completed first reading, not a bare "voted"', () => {
    expect(
      resolveOrdinanceVote({
        motion: 'Advance',
        result: 'passed',
        itemTitle: 'a. First Read to Consider Ordinance 784 for Rezoning of 4651 and 4665 Hog Mountain Road',
      })
    ).toEqual({ action: 'first_reading', newStatus: null, verified: true });
  });

  it('records a passed motion to deny as denied', () => {
    expect(
      resolveOrdinanceVote({
        motion: 'Deny',
        result: 'passed',
        itemTitle: 'Consider First Reading of Ordinance 760 Master Concept Plan',
      })
    ).toEqual({ action: 'denied', newStatus: 'denied', verified: true });
  });

  // Ordinance 786 on May 21: the motion to deny failed and the item then
  // advanced. Recording that as "failed" would read as the ordinance failing.
  it('does not record a failed motion to deny as a failure of the ordinance', () => {
    expect(
      resolveOrdinanceVote({
        motion: 'Deny',
        result: 'failed',
        itemTitle: 'b. First Read to Consider Ordinance 786 to Add a Definition for Mixed-Use Residential',
      })
    ).toEqual({ action: 'first_reading', newStatus: null, verified: false });
  });

  it('records a failed motion to approve as a failure', () => {
    expect(
      resolveOrdinanceVote({
        motion: 'Approve',
        result: 'passed',
        itemTitle: 'Consider Awarding a Contract',
      }).action
    ).toBe('approved');
    expect(
      resolveOrdinanceVote({
        motion: 'Approve',
        result: 'failed',
        itemTitle: 'a. Second Read to Consider Ordinance 799',
      })
    ).toEqual({ action: 'failed', newStatus: null, verified: true });
  });

  it('records a tabling motion as tabled', () => {
    expect(
      resolveOrdinanceVote({
        motion: 'Table',
        result: 'passed',
        itemTitle: 'b. Consideration of Executing the Construction Contract',
      })
    ).toEqual({ action: 'tabled', newStatus: 'tabled', verified: true });
  });
});

// This dashboard is meant to be adopted by other cities (see CONTRIBUTING.md
// "Adapting for Other Cities"), and municipal numbering varies widely. Flowery
// Branch's plain three-digit scheme is the narrowest case, so these guard the
// shapes a fork is likely to hit.
describe('extractOrdinanceNumbers across municipal numbering schemes', () => {
  it('keeps a year-prefixed number whole rather than truncating to the year', () => {
    expect(extractOrdinanceNumbers('Consider Ordinance 2024-15 for the Budget')).toEqual(['2024-15']);
    expect(extractOrdinanceNumbers('Consider Ordinance No. 2024-015 Amending Chapter 3')).toEqual(['2024-015']);
  });

  it('reads numbers shorter and longer than three digits', () => {
    expect(extractOrdinanceNumbers('Consider Second Reading of Ordinance 42 for the Annexation')).toEqual(['42']);
    expect(extractOrdinanceNumbers('Consider Ordinance 12345 regarding zoning')).toEqual(['12345']);
  });

  it('does not mistake a cited code section for an ordinance number', () => {
    expect(extractOrdinanceNumbers('a Variance from the Requirements of Zoning Ordinance 10.21(c)')).toEqual([]);
  });

  it('still reads a list of year-prefixed numbers', () => {
    expect(extractOrdinanceNumbers('Ordinances 2024-15 and 2024-16 to amend the code')).toEqual(['2024-15', '2024-16']);
  });
});
