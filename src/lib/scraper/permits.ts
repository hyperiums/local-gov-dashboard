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
  if (/PERMITS ISSUED BY TYPE/i.test(text)) {
    return parseByTypeReport(text, month, sourceUrl);
  }
  if (new RegExp(PERMIT_REPORT_RECORD_START.source, 'im').test(text)) {
    return parsePermitReport(text, month, sourceUrl);
  }
  // An unrecognised layout yields nothing on purpose. The line-scanning
  // fallback that used to run here invented records from any text that
  // happened to hold a number and a street-suffix substring, and the
  // collector could not tell those apart from real ones. Returning empty
  // lets the caller record "downloaded but unreadable" and raise it.
  return [];
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
  // Administrative records the city lists alongside construction permits.
  // Typed so they can be told apart in the by-type chart rather than
  // inflating the building-activity signal they sit next to.
  ['zoning', 'zoning'],
  ['land disturbance', 'land disturbance'],
  ['special event', 'special event'],
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
// Permit numbers restart low each year — 2023's run 1..99 — so the number
// is matched at 1-5 digits and the following type word does the real work of
// telling a record start from a parcel or lot fragment. Requiring 3 digits
// sent every 2023 report to the fallback parser instead.
const PERMIT_REPORT_RECORD_START =
  /^(\d{1,5})\s+(?:(?:\d{1,2}\/\d{1,2}\/\d{4})\s*(.*)|((?:residential|commercial|electrical|plumbing|mechanical|hvac|sign|right|row|swimming|yard|demolition|accessory|fence|deck|pool|food|zoning|land\s+disturbance|special\s+events?)\b.*))$/i;

// Types the city issues against no fixed address — zoning letters, and food
// truck permits, which attach to a vendor rather than a parcel. Only these may
// be kept without an address; any other record missing one is a parse failure.
const ADMINISTRATIVE_RECORD = /^(?:zoning|land\s+disturbance|food\s+truck)\b/i;
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

    // Zoning verification letters carry no address, parcel or city at all —
    // the city counts them in its own total, so dropping them put this
    // dashboard permanently below the figure a resident reads off the PDF.
    // The empty address column is left empty rather than guessed at.
    //
    // The type check is what keeps this narrow. A lot number beside a work
    // class ("45 Accessory", the tail of the row above) also opens a segment
    // and also has no address; admitting anything address-less would let five
    // such fragments into October 2023 alone.
    const isAdministrative =
      !parcelMatch && !cityMatch && ADMINISTRATIVE_RECORD.test(body);
    if (!addressMatch && !isAdministrative) continue;

    permits.push({
      id: uniqueId(month, segment.number, usedIds),
      month,
      type: matchPermitType(body),
      address: addressMatch ? addressMatch[1].replace(/\s+/g, ' ').trim() : '',
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
// The state is optional: July 2026 prints "5575 Spring St, Flowery Branch
// 30542" with no ", GA" at all, and dropping that record would silently lose
// a permit rather than fail visibly.
const DISTRICT_ADDRESS_ANCHOR =
  /(\d[\w\s.,'&-]*?),\s*Flowery Branch(?:\s*,\s*GA)?(?:\s*\d{5})?/i;
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

const DISTRICT_PERMIT_CODE = /([A-Z]{2,6}-\d{4,6}-\d{4})\b/;

function parseDistrictReport(text: string, month: string, sourceUrl: string): ParsedPermit[] {
  // The permit code is not always on the address line. Some months fuse it
  // there ("...Flowery Branch, GA ... IssuedBLDR-000096-2026"); others print
  // it on the district-column line below ("FLOWERY BRANCHIssuedBLDR-000183-
  // -2026"), which is skipped as a header. Records are therefore collected
  // first and keyed afterwards, so a code found anywhere before the next
  // record still names this one. Falling back to a positional key made ids
  // shift whenever a month's record order changed, replacing rows on every
  // re-scrape instead of updating them.
  const collected: { permit: ParsedPermit; code?: string }[] = [];
  let pendingTypeLines: string[] = [];
  let open: { permit: ParsedPermit; code?: string } | null = null;

  const lines = stitchWrappedAddressLines(text);

  for (const line of lines) {
    // Page footers repeat city hall's own address and would otherwise
    // parse as ghost permits ("Page 2 of 8" + "5318 Railroad Avenue")
    if (/^Page \d+ of /.test(line)) continue;
    if (DISTRICT_HEADER_LINES.some((h) => h.test(line))) {
      // The district column carries the permit code in some months, so it is
      // read for one before being discarded.
      const carried = line.match(DISTRICT_PERMIT_CODE);
      if (carried && open && !open.code) open.code = carried[1];
      continue;
    }

    const anchor = line.match(DISTRICT_ADDRESS_ANCHOR);
    if (anchor && anchor.index !== undefined) {
      const typeText = [...pendingTypeLines, line.slice(0, anchor.index)]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pendingTypeLines = [];

      // No leading \b — the code fuses with the status column ("IssuedBLDR-000096-2026")
      const permitCode = line.match(DISTRICT_PERMIT_CODE);
      open = {
        code: permitCode?.[1],
        permit: {
          id: '', // assigned once the whole record has been seen
          month,
          type: mapDistrictType(typeText),
          address: anchor[1].replace(/\s+/g, ' ').trim(),
          description: '',
          value: undefined,
          sourceUrl,
        },
      };
      collected.push(open);
      continue;
    }

    if (/^[\d/]+$/.test(line)) continue; // fused date columns
    if (/^(Yes|No)$/.test(line)) continue; // "Applied Online" column

    const description = line.match(/^Description:\s*(.*)$/);
    if (description) {
      if (open && !open.permit.description) open.permit.description = description[1].trim();
      continue;
    }

    const valuation = line.match(/\$([\d,]+\.\d{2})/);
    if (valuation) {
      if (open && open.permit.value === undefined) {
        open.permit.value = parseFloat(valuation[1].replace(/,/g, ''));
      }
      continue;
    }

    const loose = line.match(DISTRICT_PERMIT_CODE);
    if (loose && open && !open.code) open.code = loose[1];

    pendingTypeLines.push(line);
  }

  const usedIds = new Set<string>();
  const permits = collected.map(({ permit, code }, index) => ({
    ...permit,
    id: uniqueId(month, code ?? String(index), usedIds),
  }));

  return permits;
}

// "PERMITS ISSUED BY TYPE" layout (2020 through 2022). Records are grouped
// under all-caps type banners and each one ends with its "Description:" line
// — one per record, which is what the report's own per-type totals count. A
// permit worked by two parties is listed once per party, and the city counts
// both, so records are not deduplicated by permit code.
//
// Addresses are the hard part: the city column is glued to whatever fragment
// the address wrapped on, in either of two places — "6490 Bell DrFlowery" /
// "Branch, GA 30542", or "5320 Briggs St, LOT" / "5Flowery Branch, GA". Both
// are stitched back together before anything is read.
// Dropped from the record but left mid-record: these sit between a record's
// address and its Description line, so treating them as boundaries would
// discard the record that is still being read. The page footer repeats city
// hall's own address, which is exactly why it must be dropped rather than
// buffered — it would otherwise be picked up as the permit's address.
const BY_TYPE_NOISE = [
  /^Page \d+ of /,
  /^FLOWERY$/,
  /^BRANCH$/,
  /^\d+$/, // chart axis labels, and the zip left over after the city column
  // A record can begin on one page and end on the next, so the banner and
  // column headers reprinted at every page break are stepped over rather
  // than treated as the end of whatever is being read.
  /^PERMITS ISSUED BY TYPE/i,
  /^FOR CITY OF/i,
  /^Permit #/i,
  /^Application Date/i,
  /^(Fee Total)?Valuation/i,
  /^Permit (Count|Type)$/i,
];

// Real boundaries: the running total that closes a type section.
const BY_TYPE_BOUNDARY = [/^PERMITS ISSUED FOR/i];

// All-caps banner opening a type section, e.g. "BUILDING (RESIDENTIAL)".
// The per-record type repeats underneath in title case, so treating the
// banner as a divider loses nothing and keeps chart labels out of addresses.
const BY_TYPE_SECTION_BANNER = /^[A-Z][A-Z ()/&-]{3,}$/;

const BY_TYPE_CITY = /\s*,?\s*Flowery\s*Branch\s*,?\s*GA(?:\s*\d{5})?/i;
// City work occasionally sits on a road in a neighbouring city (a Thurmon
// Tanner Pkwy right-of-way permit is addressed to Oakwood), so the city
// column is matched generically when the home city is not the one printed.
const BY_TYPE_ANY_CITY = /[A-Za-z]+,\s*GA(?:\s*\d{5})?/;

// Extraction breaks the address column at arbitrary points and the city name
// can land on either side of the break — "6793 Winding Canyon Rd," / "Flowery
// Branch, GA 30542", or "...H F Reed Industrial Parkway, Flowery" / "Branch,
// GA 30542", which splits the city's own name in half. Rejoining both shapes
// first lets one anchor regex see a whole address. Every layout needs this,
// so both parsers share it.
function stitchWrappedAddressLines(text: string): string[] {
  const raw = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const next = raw[i + 1];
    const splitsCityName = next && /Flowery\s*$/i.test(raw[i]) && /^Branch\b/i.test(next);
    const breaksBeforeCity = next && /,\s*$/.test(raw[i]) && /^Flowery\s*Branch/i.test(next);
    if (splitsCityName || breaksBeforeCity) {
      lines.push(`${raw[i]} ${next}`);
      i++;
    } else {
      lines.push(raw[i]);
    }
  }
  return lines;
}

function parseByTypeReport(text: string, month: string, sourceUrl: string): ParsedPermit[] {
  const permits: ParsedPermit[] = [];
  const usedIds = new Set<string>();
  let buffer: string[] = [];

  for (const line of stitchWrappedAddressLines(text)) {
    if (BY_TYPE_NOISE.some((noise) => noise.test(line))) continue;

    if (BY_TYPE_BOUNDARY.some((edge) => edge.test(line)) || BY_TYPE_SECTION_BANNER.test(line)) {
      // Anything buffered before a boundary belongs to no record that is
      // still open, so it must not bleed into the one that follows.
      buffer = [];
      continue;
    }

    const description = line.match(/^Description:\s*(.*)$/);
    if (!description) {
      buffer.push(line);
      continue;
    }

    const body = buffer.join(' ').replace(/\s+/g, ' ').trim();
    buffer = [];

    const cityMatch = body.match(BY_TYPE_CITY) ?? body.match(BY_TYPE_ANY_CITY);
    if (!cityMatch || cityMatch.index === undefined) continue;

    // Everything up to the city column is type, workclass, then address;
    // the address is the run that starts at the street number.
    const head = body.slice(0, cityMatch.index);
    const addressMatch = head.match(/(\d[\w\s.,'#&/-]*)$/);
    if (!addressMatch) continue;

    const permitCode = body.match(/([A-Z]{2,6}-\d{4,6}-\d{4})\b/);
    const valuation = body.match(/\$([\d,]+\.\d{2})/);

    permits.push({
      id: uniqueId(month, permitCode ? permitCode[1] : String(permits.length), usedIds),
      month,
      type: mapDistrictType(head.slice(0, addressMatch.index)),
      address: addressMatch[1].replace(/\s+/g, ' ').trim(),
      description: description[1].trim(),
      value: valuation ? parseFloat(valuation[1].replace(/,/g, '')) : undefined,
      sourceUrl,
    });
  }

  return permits;
}
