// Permit PDF scraping and parsing
import { cityWebsiteUrl } from '../city-config-client';
import { MONTH_NAMES, ALT_MONTH_NAMES } from './utils';

// Get permit PDF URL for a given month
export function getPermitPdfUrl(year: string, month: string): string[] {
  const monthName = MONTH_NAMES[month];
  const altNames = ALT_MONTH_NAMES[month] || [];
  const monthLower = monthName.toLowerCase();
  const basePath = `${cityWebsiteUrl}/Documents/Departments/Community%20Development/Monthly%20Permit%20Statistics`;

  const urls: string[] = [];

  // Root level - "permitlisting" format (2024+)
  urls.push(`${cityWebsiteUrl}/${monthName}${year}permitlisting.pdf`);
  altNames.forEach((name) =>
    urls.push(`${cityWebsiteUrl}/${name}${year}permitlisting.pdf`)
  );

  // Root level - "permit" format (2020 and some others)
  urls.push(`${cityWebsiteUrl}/${monthName}${year}permit.pdf`);
  altNames.forEach((name) =>
    urls.push(`${cityWebsiteUrl}/${name}${year}permit.pdf`)
  );

  // Documents folder - "permitlisting" format (2023)
  urls.push(`${basePath}/${year}/${monthLower}${year}permitlisting.pdf`);
  altNames.forEach((name) =>
    urls.push(`${basePath}/${year}/${name.toLowerCase()}${year}permitlisting.pdf`)
  );

  // Documents folder - "permit_listing" format (some 2023)
  urls.push(`${basePath}/${year}/${monthLower}${year}permit_listing.pdf`);

  // Documents folder - "permit" format (2022 and earlier)
  urls.push(`${basePath}/${year}/${monthLower}${year}permit.pdf`);
  altNames.forEach((name) =>
    urls.push(`${basePath}/${year}/${name.toLowerCase()}${year}permit.pdf`)
  );

  return urls;
}

export interface ParsedPermit {
  id: string;
  month: string;
  type: string;
  address: string;
  description: string;
  value?: number;
  sourceUrl: string;
}

// The city has published two report layouts so far:
//  - "Permit Report" (2024 through May 2026): one table row per permit,
//    columns Permit # / Issued Date / Type / Contractor / Parcel /
//    Address / City / Work Class. No valuation column.
//  - "PERMITS ISSUED BY DISTRICT" (June 2026 onward): one block per
//    permit with a "street, Flowery Branch, GA zip" address line, a
//    $valuation, and a Description line.
// PDF text extraction hands us cell fragments as separate lines, so both
// parsers segment records by structural anchors (permit#+date, or the
// city-and-state address line) instead of assuming one line per permit.
export function parsePermitPdfText(
  text: string,
  month: string,
  sourceUrl: string
): ParsedPermit[] {
  if (text.includes('PERMITS ISSUED BY DISTRICT')) {
    return parseDistrictReport(text, month, sourceUrl);
  }
  if (new RegExp(PERMIT_REPORT_RECORD_START.source, 'im').test(text)) {
    return parsePermitReport(text, month, sourceUrl);
  }
  return parseLegacyLines(text, month, sourceUrl);
}

// Longest-match-first vocabulary for the "Permit Type" column. Values are
// normalized for the by-type chart on /development ("Residential Building"
// and "Building (Residential)" should group together as residential).
const PERMIT_TYPE_VOCABULARY: [string, string][] = [
  ['residential building', 'residential'],
  ['swimming pool', 'swimming pool'],
  ['yard sale', 'yard sale'],
  ['right-of-way', 'right-of-way'],
  ['right of way', 'right-of-way'],
  ['row/driveway', 'right-of-way'],
  ['food truck', 'food truck'],
  ['commercial', 'commercial'],
  ['residential', 'residential'],
  ['electrical', 'electrical'],
  ['plumbing', 'plumbing'],
  ['mechanical', 'mechanical'],
  ['demolition', 'demolition'],
  ['accessory', 'accessory'],
  ['fence', 'fence'],
  ['deck', 'deck'],
  ['pool', 'swimming pool'],
  ['hvac', 'hvac'],
  ['sign', 'sign'],
];

function matchPermitType(text: string): string {
  const lower = text.toLowerCase();
  for (const [needle, normalized] of PERMIT_TYPE_VOCABULARY) {
    if (lower.startsWith(needle)) {
      return normalized;
    }
  }
  return 'other';
}

function uniqueId(month: string, key: string, used: Set<string>): string {
  let id = `permit-${month}-${key}`;
  let n = 2;
  while (used.has(id)) {
    id = `permit-${month}-${key}-${n}`;
    n++;
  }
  used.add(id);
  return id;
}

// "Permit Report" layout. Records start with "<permit#> <M/D/YYYY> <type>"
// — or just "<permit#> <type>" in the 2024 variant that has no Issued Date
// column. The type-word requirement keeps parcel fragments that happen to
// start a line ("15047 003079 ...") from opening phantom records. Records
// wrap across many extracted lines; page footers can fuse onto record text
// ("Page: 4 of 4New"), so footers are stripped as prefixes rather than
// dropping whole lines.
const PERMIT_REPORT_RECORD_START =
  /^(\d{3,5})\s+(?:(?:\d{1,2}\/\d{1,2}\/\d{4})\s*(.*)|((?:residential|commercial|electrical|plumbing|mechanical|hvac|sign|right|row|swimming|yard|demolition|accessory|fence|deck|pool|food)\b.*))$/i;
const PARCEL_NUMBER = /\b\d{5}[A-Z]?\s?\d{6}\b/;
// Tolerates the city's own typos ("FLOWERY BRNACH" appears in Oct 2024)
const CITY_ANCHOR = /\bFLOWERY\s+BR\w+\b/i;

function parsePermitReport(text: string, month: string, sourceUrl: string): ParsedPermit[] {
  const segments: { number: string; body: string[] }[] = [];
  let current: { number: string; body: string[] } | null = null;

  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/^Page:\s*\d+\s*of\s*\d+/, '').trim();
    if (!line) continue;
    if (/^Permit Report$/i.test(line)) continue;
    if (/^Total Records:\s*\d+/i.test(line)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}$/.test(line)) continue;

    const start = line.match(PERMIT_REPORT_RECORD_START);
    if (start) {
      const rest = start[2] ?? start[3];
      current = { number: start[1], body: rest ? [rest] : [] };
      segments.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  const permits: ParsedPermit[] = [];
  const usedIds = new Set<string>();

  for (const segment of segments) {
    const body = segment.body.join(' ').replace(/\s+/g, ' ').trim();

    // Some records lack the city column entirely (subdivision text bleeds
    // into it); the record is still real, so parse the address from what
    // follows the parcel and keep it rather than dropping the permit
    const cityMatch = body.match(CITY_ANCHOR);
    const head = cityMatch && cityMatch.index !== undefined
      ? body.slice(0, cityMatch.index).trim()
      : body;
    const tail = cityMatch && cityMatch.index !== undefined
      ? body.slice(cityMatch.index + cityMatch[0].length).trim()
      : '';

    // The address sits between the parcel number and the city column
    const parcelMatch = head.match(PARCEL_NUMBER);
    const afterParcel = parcelMatch && parcelMatch.index !== undefined
      ? head.slice(parcelMatch.index + parcelMatch[0].length)
      : head;
    // Some addresses have no street number ("Gainesville St" for city
    // right-of-way work), so fall back to a street-suffix match
    const addressMatch =
      afterParcel.match(/(\d{1,6}\s+\S.*)$/) ??
      afterParcel.match(
        /(\S+\s+(?:Street|St|Road|Rd|Drive|Dr|Avenue|Ave|Lane|Ln|Way|Circle|Cir|Court|Ct|Boulevard|Blvd|Parkway|Pkwy)\.?)$/i
      );
    if (!addressMatch) continue;

    permits.push({
      id: uniqueId(month, segment.number, usedIds),
      month,
      type: matchPermitType(body),
      address: addressMatch[1].replace(/\s+/g, ' ').trim(),
      description: tail,
      value: undefined, // this layout has no valuation column
      sourceUrl,
    });
  }

  return permits;
}

// "PERMITS ISSUED BY DISTRICT" layout. Each permit block is anchored by
// its "<street>, Flowery Branch, GA <zip>" line; the type text precedes
// the anchor (sometimes on the anchor line itself), and the $valuation
// and Description lines follow it — possibly across a page break.
// Zip is optional — some records end at "Flowery Branch, GA"
const DISTRICT_ADDRESS_ANCHOR = /(\d[\w\s.,'&-]*?),\s*Flowery Branch,\s*GA(?:\s*\d{5})?/i;
const DISTRICT_HEADER_LINES = [
  /^PERMITS ISSUED BY DISTRICT/i,
  /^FOR CITY OF/i,
  /^Permit District$/i,
  /^Permit #\s/i,
  /^Application Date/i,
  /^(Fee Total)?Valuation/i,
  // District banner, and the city-column continuation of address lines
  // that wrapped ("FLOWERY BRANCHIssued 08119 000216MECR-000159-2026")
  /^FLOWERY BRANCH/,
];

function mapDistrictType(typeText: string): string {
  const grouped = typeText.match(
    /\b(Building|Electrical|HVAC|Plumbing|Mechanical)\s*\((Residential|Commercial)\)/i
  );
  if (grouped) {
    const trade = grouped[1].toLowerCase();
    return trade === 'building' ? grouped[2].toLowerCase() : trade;
  }
  if (/^ROW\b|right.of.way/i.test(typeText)) return 'right-of-way';
  if (/^Sign\b/i.test(typeText)) return 'sign';
  return 'other';
}

function parseDistrictReport(text: string, month: string, sourceUrl: string): ParsedPermit[] {
  const permits: ParsedPermit[] = [];
  const usedIds = new Set<string>();
  let pendingTypeLines: string[] = [];
  let open: ParsedPermit | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    // Page footers repeat city hall's own address and would otherwise
    // parse as ghost permits ("Page 2 of 8" + "5318 Railroad Avenue")
    if (/^Page \d+ of /.test(line)) continue;
    if (DISTRICT_HEADER_LINES.some((h) => h.test(line))) continue;

    const anchor = line.match(DISTRICT_ADDRESS_ANCHOR);
    if (anchor && anchor.index !== undefined) {
      const typeText = [...pendingTypeLines, line.slice(0, anchor.index)]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pendingTypeLines = [];

      // No leading \b — the code fuses with the status column ("IssuedBLDR-000096-2026")
      const permitCode = line.match(/([A-Z]{2,6}-\d{4,6}-\d{4})\b/);
      open = {
        id: uniqueId(month, permitCode ? permitCode[1] : String(permits.length), usedIds),
        month,
        type: mapDistrictType(typeText),
        address: anchor[1].replace(/\s+/g, ' ').trim(),
        description: '',
        value: undefined,
        sourceUrl,
      };
      permits.push(open);
      continue;
    }

    if (/^[\d/]+$/.test(line)) continue; // fused date columns
    if (/^(Yes|No)$/.test(line)) continue; // "Applied Online" column

    const description = line.match(/^Description:\s*(.*)$/);
    if (description) {
      if (open && !open.description) open.description = description[1].trim();
      continue;
    }

    const valuation = line.match(/\$([\d,]+\.\d{2})/);
    if (valuation) {
      if (open && open.value === undefined) {
        open.value = parseFloat(valuation[1].replace(/,/g, ''));
      }
      continue;
    }

    pendingTypeLines.push(line);
  }

  return permits;
}

// Line-based heuristic kept for report layouts predating 2024 — those
// PDFs aren't re-scraped by the cron, but the single-month permits op
// can still target them.
function parseLegacyLines(text: string, month: string, sourceUrl: string): ParsedPermit[] {
  const permits: ParsedPermit[] = [];

  const lines = text.split('\n').filter((line) => line.trim());

  let currentPermit: Partial<ParsedPermit> | null = null;

  for (const line of lines) {
    const addressMatch = line.match(
      /(\d+\s+[A-Za-z\s]+(?:Street|St|Road|Rd|Drive|Dr|Avenue|Ave|Lane|Ln|Way|Circle|Cir|Court|Ct))/i
    );

    const typeMatch = line.match(
      /(Residential|Commercial|New Construction|Renovation|Addition|Electrical|Plumbing|HVAC|Mechanical)/i
    );

    const valueMatch = line.match(/\$?([\d,]+(?:\.\d{2})?)/);

    if (addressMatch) {
      if (currentPermit?.address) {
        permits.push({
          id: `permit-${month}-${permits.length}`,
          month,
          type: currentPermit.type || 'other',
          address: currentPermit.address,
          description: currentPermit.description || '',
          value: currentPermit.value,
          sourceUrl,
        });
      }

      currentPermit = {
        address: addressMatch[1].trim(),
      };
    }

    if (currentPermit) {
      if (typeMatch && !currentPermit.type) {
        currentPermit.type = typeMatch[1].toLowerCase();
      }
      if (valueMatch && !currentPermit.value) {
        const value = parseFloat(valueMatch[1].replace(/,/g, ''));
        if (!isNaN(value) && value > 100) {
          currentPermit.value = value;
        }
      }
    }
  }

  if (currentPermit?.address) {
    permits.push({
      id: `permit-${month}-${permits.length}`,
      month,
      type: currentPermit.type || 'other',
      address: currentPermit.address,
      description: currentPermit.description || '',
      value: currentPermit.value,
      sourceUrl,
    });
  }

  return permits;
}
