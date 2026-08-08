import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePermitPdfText } from '@/lib/scraper/permits';

// Fixtures are real permit-report text extracted exactly the way
// handlers/shared.ts parsePdf does (unpdf extractText, pages joined
// with \n), so these tests exercise what production actually sees.
//
// Ground truths come from the PDFs themselves: the "Permit Report"
// format prints "Total Records: N"; the "PERMITS ISSUED BY DISTRICT"
// format has one ", Flowery Branch, GA" address anchor per record
// (47 after excluding the 8 page footers).
const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'src/tests/fixtures', name), 'utf-8');

const parse = (name: string, month: string) =>
  parsePermitPdfText(fixture(name), month, `https://example.test/${month}.pdf`);

describe('parsePermitPdfText - Permit Report format (May 2026, all-caps)', () => {
  const permits = parse('permit-2026-05.txt', '2026-05');
  const byId = new Map(permits.map(p => [p.id, p]));

  it('finds all 13 records (PDF says "Total Records: 13")', () => {
    expect(permits).toHaveLength(13);
  });

  it('keys ids by permit number so re-scrapes stay stable', () => {
    expect(byId.has('permit-2026-05-1408')).toBe(true);
    expect(byId.has('permit-2026-05-1255')).toBe(true);
  });

  it('extracts the street address, not parcel or header fragments', () => {
    expect(byId.get('permit-2026-05-1408')?.address).toBe('5866 SPOUT SPRINGS ROAD');
    expect(byId.get('permit-2026-05-1396')?.address).toBe('6676 TRAILSIDE DRIVE');
    for (const p of permits) {
      expect(p.address).toMatch(/^\d+ /);
    }
  });

  it('extracts permit types from the type column', () => {
    expect(byId.get('permit-2026-05-1408')?.type).toBe('right-of-way');
    expect(byId.get('permit-2026-05-1396')?.type).toBe('swimming pool');
    expect(byId.get('permit-2026-05-1255')?.type).toBe('residential');
  });

  it('reports no value because this format has no valuation column', () => {
    for (const p of permits) {
      expect(p.value).toBeUndefined();
    }
  });
});

describe('parsePermitPdfText - Permit Report format (April 2026, mixed case)', () => {
  const permits = parse('permit-2026-04.txt', '2026-04');
  const byId = new Map(permits.map(p => [p.id, p]));

  it('finds all 36 records (PDF says "Total Records: 36")', () => {
    expect(permits).toHaveLength(36);
  });

  it('handles mixed-case city names and uncommon types', () => {
    expect(byId.get('permit-2026-04-1387')?.address).toBe('6647 Parsons St');
    expect(byId.get('permit-2026-04-1387')?.type).toBe('electrical');
    expect(byId.get('permit-2026-04-1386')?.address).toBe('7019 VALLEY FORGE DRIVE');
    expect(byId.get('permit-2026-04-1386')?.type).toBe('yard sale');
  });

  it('never fabricates values from permit or street numbers', () => {
    for (const p of permits) {
      expect(p.value).toBeUndefined();
    }
  });
});

describe('parsePermitPdfText - Permit Report format (Nov 2025)', () => {
  it('finds all 35 records (PDF says "Total Records: 35")', () => {
    expect(parse('permit-2025-11.txt', '2025-11')).toHaveLength(35);
  });
});

describe('parsePermitPdfText - Permit Report format edge cases (2024)', () => {
  it('recognizes Fence records as record starts (Jan 2024, "Total Records: 25")', () => {
    const permits = parse('permit-2024-01.txt', '2024-01');
    expect(permits).toHaveLength(25);
    const fence = permits.filter(p => p.type === 'fence');
    expect(fence.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps records whose address has no street number (Dec 2024, "Total Records: 70")', () => {
    const permits = parse('permit-2024-12.txt', '2024-12');
    expect(permits).toHaveLength(70);
    // Permit 781 is a Row/Driveway on "Gainesville St" with no street number
    const gainesville = permits.find(p => p.id === 'permit-2024-12-781');
    expect(gainesville?.address).toBe('Gainesville St');
    expect(gainesville?.type).toBe('right-of-way');
  });

  it('survives city-typo and city-less records (Oct 2024, "Total Records: 59")', () => {
    const permits = parse('permit-2024-10.txt', '2024-10');
    // 661's city reads "FLOWERY BRNACH" in the city's own PDF; 615/617/622
    // have subdivision text where the city column should be
    expect(permits.length).toBeGreaterThanOrEqual(58);
    const chickory = permits.filter(p => /CHICKORY/i.test(p.address));
    expect(chickory.length).toBeGreaterThanOrEqual(3);
  });
});

describe('parsePermitPdfText - Permit Report format without Issued Date column (Feb 2024)', () => {
  const permits = parse('permit-2024-02.txt', '2024-02');
  const byId = new Map(permits.map(p => [p.id, p]));

  it('finds all 18 records (PDF says "Total Records: 18")', () => {
    expect(permits).toHaveLength(18);
  });

  it('anchors records on permit number + type when there is no date', () => {
    expect(byId.get('permit-2024-02-451')?.address).toBe('6812 CHEROKEE ROSE WAY');
    expect(byId.get('permit-2024-02-451')?.type).toBe('right-of-way');
    expect(byId.get('permit-2024-02-450')?.address).toBe('4450 HOG MOUNTAIN ROAD');
    expect(byId.get('permit-2024-02-450')?.type).toBe('sign');
  });
});

describe('parsePermitPdfText - District format (June 2026)', () => {
  const permits = parse('permit-2026-06.txt', '2026-06');

  it('finds all 48 records ("GRAND TOTAL OF PERMITS: 48") and no page-footer ghosts', () => {
    expect(permits).toHaveLength(48);
    for (const p of permits) {
      expect(p.address).not.toContain('5318 Railroad Avenue');
    }
  });

  it('keeps records whose address wraps between street and city lines', () => {
    // ROW-000160-2026's address splits as "...Winding Canyon Rd," /
    // "Flowery Branch, GA 30542" in the extracted text
    const windingCanyon = permits.find(p => /Winding Canyon/.test(p.address));
    expect(windingCanyon?.type).toBe('right-of-way');
  });

  it('maps district-report types onto the site vocabulary', () => {
    const counts: Record<string, number> = {};
    for (const p of permits) {
      counts[p.type] = (counts[p.type] || 0) + 1;
    }
    expect(counts).toEqual({
      residential: 30,
      commercial: 6,
      electrical: 4,
      hvac: 2,
      sign: 3,
      'right-of-way': 3,
    });
  });

  it('takes value from the dollar valuation, not nearby numbers', () => {
    const parsons = permits.find(p => p.address === '6645 Parsons St');
    expect(parsons?.value).toBe(288000);
    expect(parsons?.type).toBe('residential');
    expect(parsons?.description).toBe('New Townhome - Sudbury G - Lot 45');

    const cantrell = permits.filter(p => p.address === '4717 Cantrell Road');
    expect(cantrell).toHaveLength(2);
    for (const p of cantrell) {
      expect(p.type).toBe('electrical');
      expect(p.value).toBe(0);
    }
  });

  it('keys ids by the permit code', () => {
    expect(permits.some(p => p.id === 'permit-2026-06-BLDR-000096-2026')).toBe(true);
  });
});

// The three layouts below predate 2024 and were previously handled by a
// line-scanning fallback that matched street suffixes inside ordinary words
// ("Elect" from "Electrical", because Ct/St/Dr need no word boundary) and
// took the first number on a line as a dollar value. That produced permits
// with address "74 Elect" valued at 8111 — the parcel number — and got the
// record count wrong in both directions. Ground truths here come from the
// PDFs' own totals.
describe('parsePermitPdfText - Permits Issued By Type (Jan 2021)', () => {
  const permits = parse('permit-2021-01.txt', '2021-01');

  it('finds all 83 records (per-type totals in the PDF sum to 83)', () => {
    expect(permits).toHaveLength(83);
  });

  it('never lifts a street suffix out of the middle of a word', () => {
    for (const p of permits) {
      expect(p.address).not.toMatch(/\bElect$/);
      expect(p.address).toMatch(/^\d/);
    }
  });

  it('never reuses the address number as the valuation', () => {
    for (const p of permits) {
      const leadingNumber = Number(p.address.split(/\s/)[0]);
      if (p.value !== undefined && Number.isFinite(leadingNumber)) {
        expect(p.value).not.toBe(leadingNumber);
      }
    }
  });
});

describe('parsePermitPdfText - Permits Issued By Type (Jun 2022)', () => {
  const permits = parse('permit-2022-06.txt', '2022-06');

  it('finds all 63 records (per-type totals in the PDF sum to 63)', () => {
    expect(permits).toHaveLength(63);
  });

  it('keeps the whole address when the city name fuses onto it', () => {
    // Extraction yields "6763 Winding Canyon Rd," / "LOT 22 ZFlowery Branch,"
    expect(permits.some(p => p.address === '6763 Winding Canyon Rd, LOT 22 Z')).toBe(true);
    // and "7087 Valley Forge" / "DrFlowery Branch, GA"
    expect(permits.some(p => p.address === '7087 Valley Forge Dr')).toBe(true);
  });

  it('reads the description line', () => {
    const shed = permits.find(p => p.address === '7087 Valley Forge Dr');
    expect(shed?.description).toBe("STORAGE SHED 8'X15'");
  });

  it('excludes the city-hall address repeated in every page footer', () => {
    for (const p of permits) {
      expect(p.address).not.toMatch(/5410 Pine Street/i);
    }
  });
});

describe('parsePermitPdfText - Permits Issued By Type (Feb 2022)', () => {
  it('finds all 27 records (per-type totals in the PDF sum to 27)', () => {
    expect(parse('permit-2022-02.txt', '2022-02')).toHaveLength(27);
  });
});

describe('parsePermitPdfText - Permit Report with two-digit permit numbers (Mar 2023)', () => {
  const permits = parse('permit-2023-03.txt', '2023-03');

  // This report's footer claims "Total Records: 28" but it prints 27 rows —
  // 8 on page 1, 10 on page 2, 9 on page 3, counted off the rendered pages.
  // Permit numbers run 46-74 with 59 and 67 absent. The footer is the city's
  // error; 27 is what the report actually lists.
  it('finds the 27 records the report actually prints', () => {
    expect(permits).toHaveLength(27);
    expect(permits.map(p => p.id.replace('permit-2023-03-', ''))).not.toContain('67');
  });

  it('reads the address column rather than a fragment of the type column', () => {
    const byId = new Map(permits.map(p => [p.id, p]));
    expect(byId.get('permit-2023-03-74')?.address).toBe('5868 SCREECH OWL DRIVE');
    expect(byId.get('permit-2023-03-74')?.type).toBe('electrical');
    expect(byId.get('permit-2023-03-72')?.address).toBe('6127 LORIMAR COURT');
    expect(byId.get('permit-2023-03-72')?.type).toBe('hvac');
  });

  it('reports no value because this layout has no valuation column', () => {
    for (const p of permits) {
      expect(p.value).toBeUndefined();
    }
  });
});

describe('parsePermitPdfText - administrative records without an address (Oct 2023)', () => {
  const permits = parse('permit-2023-10.txt', '2023-10');

  // Permits 318 and 319 are zoning verification letters: no address, no
  // parcel, no contractor. The city counts them in "Total Records: 42", so
  // dropping them left this dashboard reading 40 against a published 42.
  it('finds all 42 records (PDF says "Total Records: 42")', () => {
    expect(permits).toHaveLength(42);
  });

  it('keeps them with an empty address rather than inventing one', () => {
    const byId = new Map(permits.map(p => [p.id, p]));
    expect(byId.get('permit-2023-10-318')?.address).toBe('');
    expect(byId.get('permit-2023-10-319')?.address).toBe('');
  });

  it('types them apart from construction so they can be filtered out', () => {
    const byId = new Map(permits.map(p => [p.id, p]));
    expect(byId.get('permit-2023-10-318')?.type).toBe('zoning');
    expect(byId.get('permit-2023-10-319')?.type).toBe('zoning');
  });

  it('still drops a record that has a parcel or city but no readable address', () => {
    // Guards the relaxation above: an address that failed to parse is a bug,
    // not an administrative record, and must not be admitted as an empty one.
    const withParcel = '99 Residential 08111 003303 FLOWERY BRANCH SUMMIT LAKE NEW';
    const parsed = parsePermitPdfText(withParcel, '2023-10', 'https://example.test/x.pdf');
    expect(parsed).toHaveLength(0);
  });
});

describe('parsePermitPdfText - degenerate input', () => {
  it('returns no permits for empty text', () => {
    expect(parsePermitPdfText('', '2026-01', 'https://example.test/x.pdf')).toEqual([]);
  });

  // Returning nothing lets the collector record "downloaded but unreadable"
  // and raise it. Guessing records from unknown text hid a broken parse as
  // real data for four years of reports.
  it('returns no permits for text in no recognised layout', () => {
    const text = '1234 Some Street\nElectrical\n$5,000.00\nSomething else entirely';
    expect(parsePermitPdfText(text, '2026-01', 'https://example.test/x.pdf')).toEqual([]);
  });
});
